import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  findDuplicateAttributesInLine,
  fixDuplicateClassNames,
  validateSourceContent,
  validateAndFixProjectSources,
} from "../build-app/source-validation";
import { addMainShellClass } from "../build-app/jsx-edit";
import { handleBuildAppPlan } from "../build-app/orchestrate";
import { applyFileChanges, getProject } from "../build-app/project-store";
import { resolveTemplateFiles } from "../build-app/templates";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

describe("source validation", () => {
  it("detects duplicate className on one JSX tag", () => {
    const line = '<main className="dashboard-shell" className="container dashboard-shell" style={{}}>';
    expect(findDuplicateAttributesInLine(line)).toContain("className");
  });

  it("auto-fixes duplicate className attributes", () => {
    const broken =
      '<main className="dashboard-shell" className="container dashboard-shell" style={{ padding: 24 }}>';
    const fixed = fixDuplicateClassNames(broken);
    expect(fixed).not.toMatch(/className="[^"]*"[^>]*className="/);
    expect(fixed).toContain("container");
    expect(fixed).toContain("dashboard-shell");
    expect(validateSourceContent("page.tsx", fixed)).toHaveLength(0);
  });

  it("flags unresolved template variables", () => {
    const issues = validateSourceContent("page.tsx", "<h1>{{APP_TITLE}}</h1>");
    expect(issues.some((i) => /template variable/i.test(i.message))).toBe(true);
  });
});

describe("jsx edit helpers", () => {
  it("does not duplicate className when shell class already present", () => {
    const src = '<main className="container dashboard-shell" style={{}}>';
    expect(addMainShellClass(src)).toBeNull();
  });

  it("adds shell class to existing className safely", () => {
    const src = '<main className="container" style={{}}>';
    const out = addMainShellClass(src);
    expect(out).toContain('className="container dashboard-shell"');
    expect(out?.match(/className=/g)?.length).toBe(1);
  });

  it("does not inject second className attribute (regression)", () => {
    const indicatorPage = `<main className="container dashboard-shell" style={{ padding: 24 }}>`;
    const out = addMainShellClass(indicatorPage);
    expect(out).toBeNull();
  });
});

describe("indicator-search-dashboard template", () => {
  it("resolves without duplicate attributes or unresolved vars", () => {
    const files = resolveTemplateFiles("indicator-search-dashboard", {
      APP_TITLE: "Indicator Search",
      APP_SUBTITLE: "Search indicators and review matches in one place.",
      APP_NAME: "indicator-search",
      SEARCH_METHOD: "GET",
      SEARCH_ENDPOINT: "/v3/indicators/",
      DETAIL_METHOD: "GET",
      DETAIL_ENDPOINT: "/v3/indicators/{id}/",
      PRODUCT: "CTIX",
      READ_ONLY: "true",
      ENV_SNIPPET: "# test",
    });
    const page = files.find((f) => f.path === "app/page.tsx");
    expect(page).toBeTruthy();
    expect(validateSourceContent("app/page.tsx", page!.content)).toHaveLength(0);
    expect(page!.content).toMatch(/className="dashboard-page"/);
    expect(page!.content).toMatch(/className="dashboard-title"/);
  });
});

describe("full scaffold workflow", () => {
  it("plan → apply produces valid sources", () => {
    const plan = handleBuildAppPlan({
      message: "Build me an indicator search dashboard with search box, CQL filter, table, and details panel.",
    });
    const pid = plan.project!.id;
    applyFileChanges(pid, plan.pendingChanges!);
    const p = getProject(pid)!;
    expect(p.status).toBe("scaffolded");
    expect(p.files.length).toBeGreaterThan(5);

    const report = validateAndFixProjectSources(p.rootDir);
    expect(report.ok).toBe(true);

    const pageContent = filesRead(p.rootDir, "app/page.tsx");
    expect(pageContent).toBeTruthy();
    expect(pageContent).not.toMatch(/className="[^"]*"[^>]*className="/);
    expect(pageContent).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });
});

function filesRead(root: string, rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("validateAndFixProjectSources on disk", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = path.join(os.tmpdir(), `src-val-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(path.join(tmp, "app"), { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("fixes broken page on disk before reporting ok", () => {
    writeFileSync(
      path.join(tmp, "app", "page.tsx"),
      '<main className="dashboard-shell" className="container dashboard-shell">x</main>'
    );
    const report = validateAndFixProjectSources(tmp);
    expect(report.ok).toBe(true);
    expect(report.fixed).toContain("app/page.tsx");
  });
});
