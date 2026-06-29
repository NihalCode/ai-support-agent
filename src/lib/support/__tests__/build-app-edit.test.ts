import { describe, it, expect } from "vitest";
import { deriveAppCopy, looksLikeRawPrompt } from "../build-app/app-copy";
import { classifyEditIntent, isEditIntent } from "../build-app/edit-intent";
import { cleanLandingPage, generateUiEditChanges } from "../build-app/ui-edits";
import { fixUnclosedDashboardToolbar } from "../build-app/source-validation";
import { buildScaffoldPlan, planToFileChanges } from "../build-app/plan-scaffold";
import { handleBuildAppPlan } from "../build-app/orchestrate";
import { applyFileChanges, getProject, readProjectFile } from "../build-app/project-store";
import { runAppBuilderAgent } from "../build-app/appBuilderAgent";

const RAW_PROMPT =
  "Build me an indicator search dashboard. I want a simple page where I can type in an indicator or CQL query, search, see a table, and open details.";

describe("app-copy", () => {
  it("derives professional title instead of raw user prompt", () => {
    const copy = deriveAppCopy(RAW_PROMPT, "indicator-search-dashboard");
    expect(copy.title).toBe("Indicator Search Dashboard");
    expect(copy.title).not.toMatch(/^Build me/i);
    expect(looksLikeRawPrompt(RAW_PROMPT)).toBe(true);
    expect(looksLikeRawPrompt(copy.title)).toBe(false);
  });
});

describe("edit-intent", () => {
  const cases = [
    "make it cleaner",
    "make the ui cleaner",
    "remove that text",
    "remove the prompt from the landing page",
    "make it professional",
    "add a filter",
    "change the title",
    "fix the landing page",
  ];

  it.each(cases)("detects edit intent for %s", (msg) => {
    expect(isEditIntent(msg)).toBe(true);
    const intent = classifyEditIntent(msg);
    expect(intent.kind).not.toBe("explain");
  });

  it("classifies make it cleaner as clean_ui", () => {
    expect(classifyEditIntent("make it cleaner").kind).toBe("clean_ui");
  });
});

describe("scaffold prompt leakage", () => {
  it("does not embed raw user prompt in generated page.tsx", () => {
    const plan = buildScaffoldPlan({ message: RAW_PROMPT });
    expect(plan.title).not.toMatch(/^Build me/i);
    const changes = planToFileChanges(plan, "indicator-app");
    const page = changes.find((c) => c.path === "app/page.tsx")?.content ?? "";
    expect(page).not.toContain("Build me an indicator search dashboard");
    expect(page).toContain("Indicator Search Dashboard");
    expect(page).toContain("dashboard-subtitle");
  });
});

describe("edit pipeline after scaffold", () => {
  function scaffoldWithLeakedPrompt() {
    const result = handleBuildAppPlan({ message: RAW_PROMPT });
    const pid = result.project!.id;
    applyFileChanges(pid, result.pendingChanges!);
    // Simulate legacy app that leaked prompt into h1
    const pagePath = "app/page.tsx";
    const leaked = readProjectFile(pid, pagePath)!.replace(
      "Indicator Search Dashboard",
      RAW_PROMPT.slice(0, 80)
    );
    applyFileChanges(pid, [{ path: pagePath, action: "update", content: leaked }]);
    return pid;
  }

  it("make it cleaner triggers edit pipeline with file changes", () => {
    const pid = scaffoldWithLeakedPrompt();
    const edit = runAppBuilderAgent({ message: "make it cleaner", projectId: pid });
    expect(edit.explanation).not.toMatch(/Tell me what you'd like changed/i);
    expect(edit.needsApproval).toBe(true);
    expect(edit.pendingChanges?.length).toBeGreaterThan(0);
    const pageChange = edit.pendingChanges?.find((c) => c.path === "app/page.tsx");
    expect(pageChange?.content).toBeDefined();
    expect(pageChange!.content!).not.toMatch(/Build me an indicator/i);
    expect(pageChange!.content!).toContain("Indicator Search Dashboard");
  });

  it("remove prompt text modifies landing page", () => {
    const pid = scaffoldWithLeakedPrompt();
    const edit = runAppBuilderAgent({
      message: "Remove the prompt text from the landing page and make it professional",
      projectId: pid,
    });
    expect(edit.pendingChanges?.some((c) => c.path === "app/page.tsx")).toBe(true);
    expect(edit.explanation).toMatch(/Got it|updating/i);
  });

  it("does not return generic clarification when active project exists", () => {
    const pid = scaffoldWithLeakedPrompt();
    const edit = runAppBuilderAgent({ message: "make the ui cleaner", projectId: pid });
    expect(edit.explanation).not.toContain("Tell me what you'd like changed");
  });

  it("resets buildOk after edit apply", () => {
    const pid = scaffoldWithLeakedPrompt();
    const p = getProject(pid)!;
    p.buildOk = true;
    const edit = runAppBuilderAgent({ message: "make it cleaner", projectId: pid });
    applyFileChanges(pid, edit.pendingChanges!);
    expect(getProject(pid)?.buildOk).toBeUndefined();
  });
});

describe("cleanLandingPage", () => {
  it("replaces leaked prompt in h1 with professional copy", () => {
    const copy = deriveAppCopy(RAW_PROMPT, "indicator-search-dashboard");
    const page = `<main><h1>${RAW_PROMPT.slice(0, 80)}</h1><p style={{ color: "#8b949e" }}>old</p></main>`;
    const out = cleanLandingPage(page, copy, RAW_PROMPT);
    expect(out).toContain("Indicator Search Dashboard");
    expect(out).not.toMatch(/Build me an indicator/i);
  });
});

describe("generateUiEditChanges", () => {
  it("adds globals.css when missing", () => {
    const project = {
      id: "x",
      name: "test",
      description: RAW_PROMPT,
      templateId: "indicator-search-dashboard" as const,
      status: "scaffolded" as const,
      rootDir: "",
      files: ["app/page.tsx", "app/layout.tsx"],
      pendingChanges: [],
      appliedChanges: [{ path: "app/page.tsx", action: "create" as const, content: "" }],
      deployments: [],
      createdAt: "",
      updatedAt: "",
      plan: buildScaffoldPlan({ message: RAW_PROMPT }),
    };
    const pageWithLeak = `<main><h1>${RAW_PROMPT.slice(0, 60)}</h1></main>`;
    const { changes } = generateUiEditChanges({
      project,
      message: "make it cleaner",
      intent: { kind: "clean_ui", isEdit: true, label: "Clean up UI" },
      readFile: (path) => (path === "app/page.tsx" ? pageWithLeak : path === "app/layout.tsx" ? "export default function L(){return null}" : null),
    });
    expect(changes.some((c) => c.path === "app/globals.css")).toBe(true);
    expect(changes.some((c) => c.path === "app/page.tsx")).toBe(true);
  });

  it("auto-fixes legacy broken toolbar wrapper on disk", () => {
    const broken = `<main className="dashboard-page">
      <div className="dashboard-toolbar">
        <SearchBox query={q} onSearch={() => void runSearch()} loading={loading} />
      {error && <p>{error}</p>}
    </main>`;
    const fixed = fixUnclosedDashboardToolbar(broken);
    expect(fixed).toContain("</div>");
    expect(fixed.indexOf("</div>")).toBeLessThan(fixed.indexOf("{error"));
  });
});
