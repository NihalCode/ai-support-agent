import { describe, it, expect } from "vitest";
import { selectTemplate, isBuildAppRequest, inferFeatures } from "../build-app/classify-request";
import { buildScaffoldPlan, planToFileChanges } from "../build-app/plan-scaffold";
import { generateEnvSnippet } from "../build-app/env-snippet";
import { listTemplates, resolveTemplateFiles } from "../build-app/templates";
import { checkVercelReadiness } from "../build-app/vercel-readiness";
import { handleBuildAppPlan } from "../build-app/orchestrate";
import { getProject, applyFileChanges } from "../build-app/project-store";
import { shouldRouteToBuildApp } from "../build-app/chat-routing";
import { extractBuildAppHandoff } from "../build-app/handoff";
import { runAppBuilderAgent } from "../build-app/appBuilderAgent";
import { createDeploymentPlan } from "../build-app/deploy";
import { classifyAction } from "../safety";

describe("build-app classify", () => {
  it("detects build app requests", () => {
    expect(isBuildAppRequest("Build me a CTIX indicator search dashboard")).toBe(true);
    expect(isBuildAppRequest("hello")).toBe(false);
  });

  it("selects indicator-search-dashboard template", () => {
    const { templateId } = selectTemplate(
      "Build me a simple indicator search dashboard using Cyware API with CQL filter and table results"
    );
    expect(templateId).toBe("indicator-search-dashboard");
  });

  it("infers features from message", () => {
    const f = inferFeatures("search box, table results, details panel, deploy to vercel");
    expect(f.some((x) => /search/i.test(x))).toBe(true);
    expect(f.some((x) => /table/i.test(x))).toBe(true);
  });
});

describe("build-app scaffold plan", () => {
  it("generates plan with env snippet", () => {
    const plan = buildScaffoldPlan({
      message:
        "Build me a simple indicator search dashboard using Cyware APIs. Search box, CQL filter, table, details panel.",
    });
    expect(plan.templateId).toBe("indicator-search-dashboard");
    expect(plan.title).not.toMatch(/^Build me/i);
    expect(plan.envSnippet).toMatch(/CYWARE_BASE_URL/);
    expect(plan.envSnippet).not.toMatch(/NEXT_PUBLIC_[A-Z]/);
  });

  it("generates file changes from template", () => {
    const plan = buildScaffoldPlan({ message: "Build indicator search dashboard" });
    const changes = planToFileChanges(plan, "test-app");
    expect(changes.length).toBeGreaterThan(3);
    expect(changes.some((c) => c.path === "package.json")).toBe(true);
    expect(changes.some((c) => c.path === ".env.local.example")).toBe(true);
    expect(changes.some((c) => c.path.includes("api/indicators"))).toBe(true);
  });
});

describe("build-app templates", () => {
  it("lists all 8 templates", () => {
    expect(listTemplates().length).toBe(8);
  });

  it("merges indicator template with blank base", () => {
    const files = resolveTemplateFiles("indicator-search-dashboard", {
      APP_TITLE: "Test",
      APP_SUBTITLE: "Test subtitle",
      APP_NAME: "test",
      SEARCH_METHOD: "GET",
      SEARCH_ENDPOINT: "/v3/indicators/",
      DETAIL_METHOD: "GET",
      DETAIL_ENDPOINT: "/v3/indicators/{id}/",
      PRODUCT: "CTIX",
      READ_ONLY: "true",
      ENV_SNIPPET: "# test",
    });
    expect(files.some((f) => f.path === "components/SearchBox.tsx")).toBe(true);
    expect(files.some((f) => f.path === "app/page.tsx")).toBe(true);
  });
});

describe("build-app UI edits", () => {
  it("proposes page updates when user asks to clean up dashboard UI", () => {
    const plan = handleBuildAppPlan({ message: "Build indicator search dashboard" });
    const pid = plan.project!.id;
    applyFileChanges(pid, plan.pendingChanges!);

    const edit = runAppBuilderAgent({ message: "Make the dashboard look cleaner", projectId: pid });
    expect(edit.explanation).not.toMatch(/Tell me what you'd like changed/i);
    expect(edit.needsApproval).toBe(true);
    expect(edit.pendingChanges?.length).toBeGreaterThan(0);
    const pageChange = edit.pendingChanges?.find((c) => c.path === "app/page.tsx");
    if (pageChange?.content) {
      expect(pageChange.content).not.toMatch(/className="[^"]*"[^>]*className="/);
    }
  });
});

describe("build-app deployment", () => {
  it("creates mock deployment plan in test mode", () => {
    const plan = createDeploymentPlan("missing-project", "preview");
    expect(plan.requiresApproval).toBe(true);
    expect(plan.mock).toBe(true);
  });

  it("uses real deploy when vercel token passed in request", () => {
    const prev = process.env.TEST_MODE;
    delete process.env.TEST_MODE;
    const plan = createDeploymentPlan("missing-project", "preview", { vercelToken: "test-vercel-token" });
    expect(plan.mock).toBe(false);
    if (prev === undefined) delete process.env.TEST_MODE;
    else process.env.TEST_MODE = prev;
  });
});

describe("build-app approval gates", () => {
  it("requires approval for scaffold writes", () => {
    const v = classifyAction({
      kind: "api",
      method: "POST",
      summary: "Scaffold build-app project abc",
    });
    expect(v.requiresApproval).toBe(true);
  });
});

describe("env snippet", () => {
  it("never uses NEXT_PUBLIC for secrets", () => {
    const s = generateEnvSnippet("indicator-search-dashboard", ["CTIX"]);
    expect(s).not.toMatch(/NEXT_PUBLIC_.*KEY/);
    expect(s).toMatch(/CYWARE_SECRET_KEY/);
  });
});

describe("build-app serverless persistence", () => {
  it("plan and apply survive memory cache clear (simulates new Vercel invocation)", () => {
    const result = handleBuildAppPlan({ message: "Build indicator search dashboard" });
    const pid = result.project?.id;
    expect(pid).toBeTruthy();
    expect(result.pendingChanges?.length).toBeGreaterThan(0);

    const g = globalThis as unknown as { __buildAppProjects?: Map<string, unknown> };
    g.__buildAppProjects?.clear();

    const reloaded = getProject(pid!);
    expect(reloaded?.id).toBe(pid);
    expect(reloaded?.pendingChanges.length).toBeGreaterThan(0);

    applyFileChanges(pid!, reloaded!.pendingChanges);
    expect(getProject(pid!)?.status).toBe("scaffolded");
    expect(getProject(pid!)?.files.length).toBeGreaterThan(0);
  });
});

describe("build-app chat routing", () => {
  it("routes build requests ahead of investigation", () => {
    expect(
      shouldRouteToBuildApp("Build me a CTIX indicator search dashboard", { sessionId: null })
    ).toBe(true);
    expect(
      shouldRouteToBuildApp("Our workflow fails after 30 seconds", { sessionId: null })
    ).toBe(false);
  });

  it("routes follow-up edits when build project active", () => {
    expect(
      shouldRouteToBuildApp("Make the dashboard look cleaner", { buildProjectId: "abc" })
    ).toBe(true);
  });

  it("routes deploy when project active", () => {
    expect(
      shouldRouteToBuildApp("Deploy this to Vercel preview", { buildProjectId: "abc" })
    ).toBe(true);
  });
});

describe("build-app chat handoff", () => {
  it("extracts template and ticket for handoff", () => {
    const h = extractBuildAppHandoff(
      "Build me an indicator search dashboard for ticket AISUP5-1 with table and details panel",
      {}
    );
    expect(h.templateId).toBe("indicator-search-dashboard");
    expect(h.ticketId).toBe("AISUP5-1");
    expect(h.mode).toBe("plan");
    expect(h.autoStart).toBe(true);
  });

  it("uses edit mode when project is active", () => {
    const h = extractBuildAppHandoff("Make the table sortable", { buildProjectId: "proj-1" });
    expect(h.mode).toBe("edit");
    expect(h.projectId).toBe("proj-1");
  });
});

describe("vercel readiness", () => {
  it("reports issues for missing project", () => {
    const r = checkVercelReadiness("nonexistent-id");
    expect(r.ready).toBe(false);
    expect(r.issues.length).toBeGreaterThan(0);
  });
});
