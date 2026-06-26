import { describe, it, expect } from "vitest";
import { classifyUserIntent } from "../intent/classify-intent";
import { chooseAgentRoute } from "../intent/choose-route";
import { runAppBuilderAgent } from "../build-app/appBuilderAgent";
import { handleBuildAppPlan } from "../build-app/orchestrate";
import { applyFileChanges } from "../build-app/project-store";

describe("intent integration — build app flows", () => {
  it("active app + make this client-ready triggers edit pipeline", () => {
    const plan = handleBuildAppPlan({
      message: "Build indicator search dashboard",
    });
    const pid = plan.project!.id;
    applyFileChanges(pid, plan.pendingChanges!);

    const classification = classifyUserIntent({
      message: "Make this client-ready.",
      context: { buildProjectId: pid },
    });
    expect(classification.primaryIntent).toBe("edit_app");

    const edit = runAppBuilderAgent({
      message: "This looks too much like a demo. Make it client-ready.",
      projectId: pid,
    });
    expect(edit.explanation).not.toMatch(/Tell me what you'd like changed/i);
    expect(edit.needsApproval).toBe(true);
    expect(edit.pendingChanges?.length).toBeGreaterThan(0);
  });

  it("active app + share phrasing chooses deploy route", () => {
    const classification = classifyUserIntent({
      message: "Can I share this with my team?",
      context: { buildProjectId: "proj-1", buildOk: true },
    });
    const route = chooseAgentRoute(classification, { buildProjectId: "proj-1", buildOk: true });
    expect(route.kind).toBe("build_app");
    expect(route.buildAppMode).toBe("deploy");
  });

  it("build failed + fix it routes to fix_error", () => {
    const classification = classifyUserIntent({
      message: "Fix that error.",
      context: { buildProjectId: "proj-1", buildOk: false, buildFailed: true },
    });
    expect(classification.primaryIntent).toBe("fix_error");
    const route = chooseAgentRoute(classification, {
      buildProjectId: "proj-1",
      buildOk: false,
      buildFailed: true,
    });
    expect(route.kind).toBe("build_app");
    expect(route.buildAppMode).toBe("edit");
  });
});

describe("intent integration — investigation flows", () => {
  it("no session + support issue auto-investigates", () => {
    const classification = classifyUserIntent({
      message:
        "The automation that blocks malicious IPs stopped working yesterday. I do not know the endpoint.",
    });
    const route = chooseAgentRoute(classification, {});
    expect(route.kind).toBe("investigation_create");
  });

  it("active session + customer question routes to customer response", () => {
    const classification = classifyUserIntent({
      message: "What should I tell the customer?",
      context: { sessionId: "sess-1", investigationId: "inv-1" },
    });
    const route = chooseAgentRoute(classification, {
      sessionId: "sess-1",
      investigationId: "inv-1",
    });
    expect(route.kind).toBe("investigation_customer_response");
  });
});
