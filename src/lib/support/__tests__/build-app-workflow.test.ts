import { describe, it, expect } from "vitest";
import { handleBuildAppPlan } from "../build-app/orchestrate";
import { applyFileChanges, getProject } from "../build-app/project-store";
import { runAppBuilderAgent } from "../build-app/appBuilderAgent";
import {
  isApprovalPhrase,
  isBuildAfterApprovalPhrase,
  isScaffoldApprovalMessage,
} from "../build-app/approval-phrases";
import {
  loadAppBuilderSession,
} from "../build-app/session-store";
import {
  mergeChangesIntoPending,
  sessionFromProject,
  shouldShowDescribeFallback,
} from "../build-app/session-state";
import { classifyBuildAppWorkspaceMessage } from "../intent/classify-intent";
import { buildScaffoldPlan, planToFileChanges } from "../build-app/plan-scaffold";

const RAW_PROMPT =
  "Build me an indicator search dashboard. I want a simple page where I can type in an indicator or CQL query, search, see a table, and open details.";

describe("build-app approval phrases", () => {
  it.each([
    "yes",
    "approve",
    "go ahead",
    "looks good",
    "build it",
    "Now build the app",
    "create the app",
    "apply the changes",
  ])("detects approval for %s", (msg) => {
    expect(isScaffoldApprovalMessage(msg)).toBe(true);
  });

  it("does not treat UI edit requests as approval", () => {
    expect(isScaffoldApprovalMessage("make the UI cleaner")).toBe(false);
    expect(isScaffoldApprovalMessage("apply a filter to the table")).toBe(false);
  });

  it("detects build-after-approval intent", () => {
    expect(isBuildAfterApprovalPhrase("Now build the app")).toBe(true);
    expect(isBuildAfterApprovalPhrase("yes, create my app")).toBe(true);
  });
});

describe("build-app session state", () => {
  it("tracks awaiting scaffold approval from pending project", () => {
    const result = handleBuildAppPlan({ message: "Build indicator search dashboard" });
    const project = result.project!;
    const session = sessionFromProject(project, { awaitingApproval: true });
    expect(session.currentState).toBe("awaiting_scaffold_approval");
    expect(session.pendingDiffs.length).toBeGreaterThan(0);
    expect(loadAppBuilderSession(project.id)?.activeProjectId).toBe(project.id);
  });

  it("persists session fields after pending edits", () => {
    const result = handleBuildAppPlan({ message: RAW_PROMPT });
    const pid = result.project!.id;
    const edit = runAppBuilderAgent({
      message: "make the UI cleaner, the landing page should not have any unnecessary text",
      projectId: pid,
    });
    expect(edit.explanation).not.toContain("Describe the app you want to build");
    expect(edit.pendingChanges?.length).toBeGreaterThan(0);
    const session = loadAppBuilderSession(pid)!;
    expect(session.currentState).toBe("awaiting_scaffold_approval");
    expect(session.pendingDiffs.length).toBeGreaterThan(0);
  });
});

describe("build-app pending scaffold routing", () => {
  it("updates pending diffs instead of describe fallback", () => {
    const result = handleBuildAppPlan({ message: RAW_PROMPT });
    const pid = result.project!.id;
    const edit = runAppBuilderAgent({
      message: "make the UI cleaner, the landing page should not have any unnecessary text",
      projectId: pid,
    });
    expect(edit.explanation).toMatch(/Got it|updating the plan/i);
    expect(edit.needsApproval).toBe(true);
    expect(getProject(pid)?.pendingChanges.length).toBeGreaterThan(0);
  });

  it("does not show describe fallback when pending diffs exist", () => {
    const result = handleBuildAppPlan({ message: RAW_PROMPT });
    const project = getProject(result.project!.id)!;
    expect(shouldShowDescribeFallback(project, "hello")).toBe(false);
  });

  it("shows describe fallback only without project context", () => {
    expect(shouldShowDescribeFallback(null, "hello")).toBe(true);
  });

  it("routes Now build the app to apply in workspace classifier", () => {
    const route = classifyBuildAppWorkspaceMessage("Now build the app", {
      hasProject: true,
      pendingChanges: true,
    });
    expect(route.recommendedRoute).toBe("build_app:apply");
  });
});

describe("build-app integration flow", () => {
  it("plan → modify pending → approve path keeps context", () => {
    const result = handleBuildAppPlan({ message: RAW_PROMPT });
    const pid = result.project!.id;

    runAppBuilderAgent({
      message: "make the UI cleaner, remove unnecessary landing page text",
      projectId: pid,
    });
    const pending = getProject(pid)!.pendingChanges;
    expect(pending.length).toBeGreaterThan(0);

    const page = pending.find((c) => c.path === "app/page.tsx")?.content ?? "";
    expect(page).not.toContain("Build me an indicator search dashboard");
    expect(page).toContain("Indicator Search Dashboard");

    applyFileChanges(pid, pending);
    expect(getProject(pid)?.status).toBe("scaffolded");
    expect(getProject(pid)?.files.length).toBeGreaterThan(0);
  });

  it("mergeChangesIntoPending preserves scaffold files", () => {
    const plan = buildScaffoldPlan({ message: RAW_PROMPT });
    const pending = planToFileChanges(plan, "test-app");
    const merged = mergeChangesIntoPending(pending, [
      { path: "app/page.tsx", action: "update", content: "<main>clean</main>" },
    ]);
    expect(merged.find((c) => c.path === "package.json")).toBeTruthy();
    expect(merged.find((c) => c.path === "app/page.tsx")?.content).toContain("clean");
  });
});

describe("build-app after scaffold", () => {
  it("edit after scaffold does not reset to describe fallback", () => {
    const result = handleBuildAppPlan({ message: RAW_PROMPT });
    const pid = result.project!.id;
    applyFileChanges(pid, result.pendingChanges!);
    const edit = runAppBuilderAgent({ message: "make it client-ready", projectId: pid });
    expect(edit.explanation).not.toContain("Describe the app you want to build");
    expect(edit.needsApproval).toBe(true);
  });
});

describe("build-app approval phrase unit", () => {
  it("isApprovalPhrase covers natural language variants", () => {
    expect(isApprovalPhrase("create the app")).toBe(true);
    expect(isApprovalPhrase("make the ui cleaner")).toBe(false);
  });
});
