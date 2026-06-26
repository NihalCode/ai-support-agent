import "server-only";

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface SourceValidationIssue {
  file: string;
  message: string;
}

export interface SourceValidationReport {
  ok: boolean;
  issues: SourceValidationIssue[];
  fixed: string[];
}

const SOURCE_EXT = new Set([".tsx", ".ts", ".jsx", ".js"]);

/** Detect duplicate JSX/HTML attributes on a single opening tag line. */
export function findDuplicateAttributesInLine(line: string): string[] {
  const dupes: string[] = [];
  const tagMatch = line.match(/<\w+[^>]*>/);
  if (!tagMatch) return dupes;
  const tag = tagMatch[0];
  const names = [...tag.matchAll(/\b([a-zA-Z_][\w-]*)\s*=/g)].map((m) => m[1]);
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) dupes.push(name);
    seen.add(name);
  }
  return dupes;
}

/** Merge duplicate className attributes on one tag into a single attribute. */
export function fixDuplicateClassNames(content: string): string {
  return content.replace(
    /(<\w+[^>]*?)\sclassName="([^"]*)"([^>]*?)\sclassName="([^"]*)"/g,
    (_match, before: string, c1: string, middle: string, c2: string) => {
      const merged = [...new Set(`${c1} ${c2}`.trim().split(/\s+/))].join(" ");
      return `${before} className="${merged}"${middle}`;
    }
  );
}

/** Remove unresolved {{VAR}} placeholders left from incomplete template substitution. */
export function hasUnresolvedTemplateVars(content: string): boolean {
  return /\{\{[A-Z_]+\}\}/.test(content);
}

export function validateSourceContent(file: string, content: string): SourceValidationIssue[] {
  const issues: SourceValidationIssue[] = [];
  if (hasUnresolvedTemplateVars(content)) {
    issues.push({ file, message: "Unresolved template variable ({{VAR}}) — substitution incomplete." });
  }
  for (let i = 0; i < content.split("\n").length; i++) {
    const line = content.split("\n")[i]!;
    for (const attr of findDuplicateAttributesInLine(line)) {
      issues.push({ file, message: `Line ${i + 1}: duplicate "${attr}" attribute on JSX tag.` });
    }
  }
  return issues;
}

function walkSourceFiles(dir: string, prefix: string, out: { file: string; abs: string }[]) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) walkSourceFiles(full, rel, out);
    else if (SOURCE_EXT.has(path.extname(name))) out.push({ file: rel.replace(/\\/g, "/"), abs: full });
  }
}

/** Validate and auto-fix common scaffold issues before build/deploy. */
export function validateAndFixProjectSources(rootDir: string): SourceValidationReport {
  const files: { file: string; abs: string }[] = [];
  walkSourceFiles(rootDir, "", files);

  const fixed: string[] = [];
  const issues: SourceValidationIssue[] = [];

  for (const { file, abs } of files) {
    let content = readFileSync(abs, "utf8");
    const before = content;

    if (/className="[^"]*"[^>]*className="/.test(content)) {
      content = fixDuplicateClassNames(content);
    }

    if (content !== before) {
      writeFileSync(abs, content, "utf8");
      fixed.push(file);
    }

    issues.push(...validateSourceContent(file, content));
  }

  return { ok: issues.length === 0, issues, fixed };
}

export function formatSourceValidationReport(report: SourceValidationReport): string {
  if (report.ok) {
    const fixNote = report.fixed.length ? `\nAuto-fixed: ${report.fixed.join(", ")}` : "";
    return `Source validation passed.${fixNote}`;
  }
  return [
    "Source validation failed:",
    ...report.issues.map((i) => `  ${i.file}: ${i.message}`),
    report.fixed.length ? `Auto-fixed before re-check: ${report.fixed.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
