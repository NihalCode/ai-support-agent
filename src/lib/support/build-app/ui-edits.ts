import "server-only";

import type { BuildAppFileChange, BuildAppProject } from "./types";
import { deriveAppCopy, looksLikeRawPrompt } from "./app-copy";
import type { EditIntent } from "./edit-intent";

const GLOBALS_CSS = `:root {
  --bg: #0d1117;
  --surface: #161b22;
  --border: #30363d;
  --text: #e6edf3;
  --muted: #8b949e;
  --accent: #238636;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: system-ui, -apple-system, Segoe UI, sans-serif;
  background: var(--bg);
  color: var(--text);
}

.dashboard-page {
  padding: 32px 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.dashboard-hero {
  margin-bottom: 24px;
}

.dashboard-title {
  font-size: 1.75rem;
  font-weight: 600;
  margin: 0 0 8px;
  letter-spacing: -0.02em;
}

.dashboard-subtitle {
  color: var(--muted);
  margin: 0 0 4px;
  font-size: 1rem;
  line-height: 1.5;
  max-width: 640px;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 16px;
  margin-top: 16px;
}

.dashboard-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
}

.dashboard-error {
  color: #f85149;
  margin-top: 12px;
  font-size: 0.875rem;
}

@media (max-width: 900px) {
  .dashboard-grid { grid-template-columns: 1fr; }
}
`;

export function cleanLandingPage(
  content: string,
  copy: { title: string; subtitle: string },
  rawPrompt?: string
): string {
  let out = content;

  // Replace h1 — remove raw prompt text if present
  out = out.replace(/<h1[^>]*>[\s\S]*?<\/h1>/, `<h1 className="dashboard-title">${escapeJsxText(copy.title)}</h1>`);

  // Replace subtitle / first muted paragraph after hero
  if (/<p className="dashboard-subtitle"/.test(out)) {
    out = out.replace(
      /<p className="dashboard-subtitle"[^>]*>[\s\S]*?<\/p>/,
      `<p className="dashboard-subtitle">${escapeJsxText(copy.subtitle)}</p>`
    );
  } else {
    out = out.replace(
      /<p style=\{\{[^}]*color:[^}]*\}\}>[\s\S]*?<\/p>/,
      `<p className="dashboard-subtitle">${escapeJsxText(copy.subtitle)}</p>`
    );
  }

  // Remove technical credential line if still present
  out = out.replace(
    /<p[^>]*>[\s\S]*?credentials stay server-side[\s\S]*?<\/p>\s*/i,
    ""
  );

  // Wrap hero section
  if (!out.includes("dashboard-hero")) {
    out = out.replace(
      /(<main[^>]*>)\s*(<h1 className="dashboard-title">)/,
      `$1\n      <header className="dashboard-hero">\n        $2`
    );
    out = out.replace(
      /(<p className="dashboard-subtitle">[\s\S]*?<\/p>)/,
      `$1\n      </header>`
    );
  }

  // Use CSS classes on main
  out = out.replace(/<main className="([^"]*)"[^>]*>/, '<main className="dashboard-page">');
  out = out.replace(
    /<div style=\{\{ display: "grid", gridTemplateColumns: "1fr 320px"[^}]*\}\}>/,
    '<div className="dashboard-grid">'
  );

  // Error styling
  out = out.replace(
    /\{error && <p style=\{\{ color: "#f85149" \}\}>\{error\}<\/p>\}/,
    '{error && <p className="dashboard-error">{error}</p>}'
  );

  // Strip raw prompt if leaked into JSX text nodes
  if (rawPrompt) {
    const escaped = rawPrompt.slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escaped, "gi"), copy.title);
  }

  return out;
}

function escapeJsxText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const POLISH_MARKER = "/* app-builder-ui-polish */";

const POLISH_CSS = `
${POLISH_MARKER}
.dashboard-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
  margin-bottom: 16px;
  padding: 16px;
  background: var(--surface, #161b22);
  border: 1px solid var(--border, #30363d);
  border-radius: 12px;
}

.dashboard-toolbar input,
.dashboard-toolbar button {
  font: inherit;
}

.dashboard-grid > * {
  min-width: 0;
}
`;

function applyUiPolish(opts: {
  project: BuildAppProject;
  readFile: (path: string) => string | null;
}): BuildAppFileChange[] {
  const { project, readFile } = opts;
  const changes: BuildAppFileChange[] = [];
  const globalsPath = "app/globals.css";
  const existingGlobals = readFile(globalsPath) ?? "";

  if (!existingGlobals.includes(POLISH_MARKER)) {
    changes.push({
      path: globalsPath,
      action: existingGlobals ? "update" : "create",
      content: existingGlobals + POLISH_CSS,
      previousContent: existingGlobals || undefined,
    });
  }

  const pagePath = project.files.find((f) => f.endsWith("app/page.tsx")) ?? "app/page.tsx";
  const page = readFile(pagePath) ?? "";
  if (page.includes("<SearchBox") && !page.includes("dashboard-toolbar")) {
    const updated = page.replace(
      /(\s*)<SearchBox/,
      '$1<div className="dashboard-toolbar">\n$1  <SearchBox'
    ).replace(
      /(\s*)<\/SearchBox>(\s*\n\s*\{error)/,
      "$1  </SearchBox>\n$1</div>$2"
    );
    if (updated !== page) {
      changes.push({ path: pagePath, action: "update", content: updated, previousContent: page });
    }
  }

  const layoutPath = project.files.find((f) => f.endsWith("app/layout.tsx")) ?? "app/layout.tsx";
  const layout = readFile(layoutPath) ?? "";
  if (layout && !layout.includes("globals.css")) {
    const updatedLayout = `import "./globals.css";\n\n${layout}`;
    changes.push({ path: layoutPath, action: "update", content: updatedLayout, previousContent: layout });
  }

  return changes;
}

export function generateUiEditChanges(opts: {
  project: BuildAppProject;
  message: string;
  intent: EditIntent;
  readFile: (path: string) => string | null;
}): { changes: BuildAppFileChange[]; summary: string; understoodRequest: string } {
  const { project, message, intent, readFile } = opts;
  const changes: BuildAppFileChange[] = [];
  const copy = deriveAppCopy(project.description, project.templateId, project.plan?.title);

  const pagePath = project.files.find((f) => f.endsWith("app/page.tsx")) ?? "app/page.tsx";
  const existingPage = readFile(pagePath) ?? "";

  const needsCleanup =
    intent.kind === "clean_ui" ||
    intent.kind === "remove_prompt" ||
    looksLikeRawPrompt(project.plan?.title ?? "") ||
    /<h1[^>]*>[\s\S]*build me/i.test(existingPage);

  if (needsCleanup && existingPage) {
    const updated = cleanLandingPage(existingPage, copy, project.description);
    if (updated !== existingPage) {
      changes.push({ path: pagePath, action: "update", content: updated, previousContent: existingPage });
    }
  }

  // Add globals.css if missing
  const globalsPath = "app/globals.css";
  if (!project.files.includes(globalsPath)) {
    changes.push({ path: globalsPath, action: "create", content: GLOBALS_CSS });
  }

  // Update layout to import globals
  const layoutPath = project.files.find((f) => f.endsWith("app/layout.tsx")) ?? "app/layout.tsx";
  const layout = readFile(layoutPath) ?? "";
  if (layout && !layout.includes("globals.css")) {
    const updatedLayout = layout.includes('import "./globals.css"')
      ? layout
      : `import "./globals.css";\n\n${layout}`;
    if (updatedLayout !== layout) {
      changes.push({ path: layoutPath, action: "update", content: updatedLayout, previousContent: layout });
    }
  }

  if (intent.kind === "add_filter" || /\bfilter\b/i.test(message)) {
    const tablePath = project.files.find((f) => f.includes("ResultsTable")) ?? "components/ResultsTable.tsx";
    const table = readFile(tablePath);
    if (table && !table.includes("filterText")) {
      changes.push({
        path: tablePath,
        action: "update",
        content: table.replace(
          "export function ResultsTable",
          'import { useState } from "react";\n\nexport function ResultsTable'
        ),
        previousContent: table,
      });
    }
  }

  if ((intent.kind === "clean_ui" || intent.kind === "remove_prompt") && changes.length === 0) {
    changes.push(...applyUiPolish({ project, readFile }));
  }

  const filesChanged = changes.map((c) => c.path);
  const understoodRequest =
    intent.kind === "remove_prompt"
      ? "Remove raw prompt text from the landing page and make the UI professional."
      : intent.kind === "clean_ui"
        ? "Clean up the dashboard UI with professional copy, spacing, and layout."
        : intent.label;

  const summary =
    filesChanged.length > 0
      ? `Updating ${filesChanged.join(", ")} — ${understoodRequest}`
      : "No file changes needed.";

  return { changes, summary, understoodRequest };
}
