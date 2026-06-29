import "server-only";

import type { BuildAppFileChange, BuildAppProject } from "./types";
import { classifyBuildError } from "./error-classify";
import {
  fixDuplicateClassNames,
  fixUnclosedDashboardToolbar,
  hasUnresolvedTemplateVars,
  validateSourceContent,
} from "./source-validation";

export interface BuildErrorAnalysis {
  summary: string;
  suggestedFix: string;
  kind: ReturnType<typeof classifyBuildError>["kind"];
  citedFiles: string[];
  rawExcerpt: string;
}

/** True when the user is discussing a build/compile failure (message or project state). */
export function isBuildErrorDiscussion(message: string, buildFailed?: boolean): boolean {
  if (
    /\b(npm run build|command failed|build error|turbopack|ecmascript|parsing .+ failed|exited with \d+|module not found|cannot find module|typescript error|ts\d{4}:|parse error|unexpected token|syntax error|why (the|this) error|error occurred|fix (the|this) build|tell me why.*error)\b/i.test(
      message
    )
  ) {
    return true;
  }
  if (buildFailed && /\b(error|fail|fix|why|broke|broken|occurred|build)\b/i.test(message)) return true;
  return false;
}

/** Prefer the most detailed build log available. */
export function mergeBuildLog(message: string, projectOutput?: string): string {
  const parts = [projectOutput?.trim(), message.trim()].filter(Boolean) as string[];
  if (parts.length === 0) return "";
  return parts.sort((a, b) => b.length - a.length)[0]!;
}

/** Extract source file paths cited in Next/Turbopack/npm output. */
export function extractErrorFilePaths(output: string): string[] {
  const paths = new Set<string>();
  for (const m of output.matchAll(
    /(?:^|\s|\()(?:\.\/)?([\w][\w/.-]*\.(?:tsx?|jsx?)):(\d+)/gm
  )) {
    paths.add(m[1]!.replace(/^\.\//, ""));
  }
  for (const m of output.matchAll(/\bin\s+([\w][\w/.-]*\.(?:tsx?|jsx?))\b/gi)) {
    paths.add(m[1]!.replace(/^\.\//, ""));
  }
  return [...paths];
}

function templateVarsForProject(project: BuildAppProject): Record<string, string> {
  const ep = project.plan?.endpoints[0];
  return {
    APP_TITLE: project.plan?.title ?? project.name,
    APP_NAME: project.name.replace(/[^a-z0-9-]/gi, "-").toLowerCase() || "generated-app",
    APP_SUBTITLE: project.plan?.summary ?? "Search and review results in one place.",
    SEARCH_METHOD: ep?.method ?? "GET",
    SEARCH_ENDPOINT: ep?.path ?? "/v3/indicators/",
    DETAIL_METHOD: ep?.method ?? "GET",
    DETAIL_ENDPOINT: ep?.path ? `${ep.path.replace(/\/?$/, "")}/{id}/` : "/v3/indicators/{id}/",
    PRODUCT: ep?.product ?? "CTIX",
    READ_ONLY: "true",
    ENV_SNIPPET: project.plan?.envSnippet ?? "# Set Cyware credentials in .env.local",
  };
}

function substituteTemplateVars(content: string, project: BuildAppProject): string {
  const vars = templateVarsForProject(project);
  return content.replace(/\{\{([A-Z_]+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

function fixSourceContent(content: string, project: BuildAppProject): { content: string; fixes: string[] } {
  let out = content;
  const fixes: string[] = [];

  const deduped = fixDuplicateClassNames(out);
  if (deduped !== out) {
    out = deduped;
    fixes.push("merged duplicate JSX attributes");
  }

  const toolbarFixed = fixUnclosedDashboardToolbar(out);
  if (toolbarFixed !== out) {
    out = toolbarFixed;
    fixes.push("closed unclosed dashboard-toolbar wrapper");
  }

  if (hasUnresolvedTemplateVars(out)) {
    const subbed = substituteTemplateVars(out, project);
    if (subbed !== out) {
      out = subbed;
      fixes.push("replaced unresolved template placeholders");
    }
  }

  // Stray duplicate style/className on same tag (broader than className-only helper)
  out = out.replace(
    /(<\w+[^>]*?)\s(style=\{[^}]+\})([^>]*?)\s\2/g,
    "$1 $2$3"
  );

  if (!out.includes('import "./globals.css"') && out.includes("export default")) {
    /* layout-only — handled separately */
  }

  return { content: out, fixes };
}

function ensurePackageJsonDeps(
  pkgContent: string
): { content: string; changed: boolean } {
  try {
    const pkg = JSON.parse(pkgContent) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    let changed = false;
    pkg.dependencies ??= {};
    pkg.scripts ??= {};
    for (const [name, ver] of [
      ["next", "16.2.7"],
      ["react", "19.2.4"],
      ["react-dom", "19.2.4"],
    ] as const) {
      if (!pkg.dependencies[name]) {
        pkg.dependencies[name] = ver;
        changed = true;
      }
    }
    if (!pkg.scripts.build) {
      pkg.scripts.build = "next build";
      changed = true;
    }
    if (!changed) return { content: pkgContent, changed: false };
    return { content: `${JSON.stringify(pkg, null, 2)}\n`, changed: true };
  } catch {
    return { content: pkgContent, changed: false };
  }
}

/** Human-readable analysis for chat when the user asks why the build failed. */
export function analyzeBuildError(output: string): BuildErrorAnalysis {
  const classification = classifyBuildError(output);
  const citedFiles = extractErrorFilePaths(output);
  const lines = output.split("\n").filter((l) => l.trim());
  const interesting = lines.filter((l) =>
    /error|failed|not found|parse|typescript|ts\d{4}|ecmascript|turbopack|exited with/i.test(l)
  );
  const rawExcerpt = interesting.slice(0, 6).join("\n") || lines.slice(-8).join("\n");

  let summary = classification.summary;
  if (citedFiles.length) {
    summary += ` Likely in ${citedFiles.slice(0, 3).join(", ")}.`;
  }
  if (/parsing ecmascript|parse error|unexpected token/i.test(output)) {
    summary =
      "The build failed because a generated source file has invalid JavaScript/JSX syntax (often duplicate attributes or unfinished template placeholders).";
  }

  return {
    summary,
    suggestedFix: classification.suggestedFix,
    kind: classification.kind,
    citedFiles,
    rawExcerpt,
  };
}

export function proposeBuildErrorFixes(opts: {
  project: BuildAppProject;
  message: string;
  buildOutput: string;
  readFile: (path: string) => string | null;
}): {
  changes: BuildAppFileChange[];
  summary: string;
  understoodRequest: string;
  analysis: BuildErrorAnalysis;
} {
  const { project, message, buildOutput, readFile } = opts;
  const log = mergeBuildLog(message, buildOutput);
  const analysis = analyzeBuildError(log);
  const changes: BuildAppFileChange[] = [];
  const fixNotes: string[] = [];

  const priorityFiles = [
    ...extractErrorFilePaths(log),
    ...project.files.filter((f) => /\.(tsx?|jsx?)$/.test(f)),
  ];
  const seen = new Set<string>();

  for (const rel of priorityFiles) {
    if (seen.has(rel)) continue;
    seen.add(rel);
    const existing = readFile(rel);
    if (!existing) continue;

    const { content, fixes } = fixSourceContent(existing, project);
    if (content !== existing) {
      changes.push({
        path: rel,
        action: "update",
        content,
        previousContent: existing,
      });
      fixNotes.push(`${rel}: ${fixes.join(", ")}`);
    } else {
      const issues = validateSourceContent(rel, existing);
      if (issues.length) fixNotes.push(`${rel}: ${issues[0]!.message}`);
    }
  }

  const layoutPath = project.files.find((f) => f.endsWith("app/layout.tsx")) ?? "app/layout.tsx";
  const layout = readFile(layoutPath) ?? "";
  if (layout && !layout.includes("globals.css") && project.files.includes("app/globals.css")) {
    const updated = `import "./globals.css";\n\n${layout}`;
    if (!changes.some((c) => c.path === layoutPath)) {
      changes.push({
        path: layoutPath,
        action: "update",
        content: updated,
        previousContent: layout,
      });
      fixNotes.push(`${layoutPath}: added globals.css import`);
    }
  }

  const pkgPath = "package.json";
  const pkg = readFile(pkgPath);
  if (pkg && (analysis.kind === "missing_command" || /next:\s*command not found/i.test(log))) {
    const { content, changed } = ensurePackageJsonDeps(pkg);
    if (changed) {
      changes.push({
        path: pkgPath,
        action: "update",
        content,
        previousContent: pkg,
      });
      fixNotes.push("package.json: ensured next/react dependencies and build script");
    }
  }

  const understoodRequest =
    /\b(why|what caused|explain|tell me)\b/i.test(message)
      ? `Explain the build failure and apply an automatic fix where possible.`
      : `Fix the build failure and prepare for a rebuild.`;

  const summary =
    changes.length > 0
      ? `Fix build error — ${fixNotes.join("; ")}`
      : `Analyzed build error — ${analysis.summary}`;

  return { changes, summary, understoodRequest, analysis };
}

export function formatBuildErrorExplanation(analysis: BuildErrorAnalysis): string {
  return [
    `**Why it failed:** ${analysis.summary}`,
    analysis.citedFiles.length ? `**Files cited in the log:** ${analysis.citedFiles.join(", ")}` : "",
    analysis.rawExcerpt ? `**From the build log:**\n\`\`\`\n${analysis.rawExcerpt.slice(0, 1200)}\n\`\`\`` : "",
    `**Suggested fix:** ${analysis.suggestedFix}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
