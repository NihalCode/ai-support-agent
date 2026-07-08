import { describe, it, expect } from "vitest";
import { classifyUserIntent } from "../intent/classify-intent";
import { chooseAgentRoute } from "../intent/choose-route";

describe("intent integration — unsupported app build", () => {
  it("build request routes to unsupported_app_build", () => {
    const classification = classifyUserIntent({
      message: "Build indicator search dashboard",
    });
    expect(classification.primaryIntent).toBe("unsupported_app_build_request");
    const route = chooseAgentRoute(classification, {}, classification.extractedEntities.supportIssue ?? "Build indicator search dashboard");
    expect(route.kind).toBe("unsupported_app_build");
  });

  it("active app + share phrasing routes to unsupported app build", () => {
    const classification = classifyUserIntent({
      message: "Can I share this with my team?",
      context: { buildProjectId: "proj-1", buildOk: true },
    });
    const route = chooseAgentRoute(classification, { buildProjectId: "proj-1", buildOk: true });
    expect(route.kind).toBe("unsupported_app_build");
  });

  it("active app + fix error routes to unsupported app build", () => {
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
    expect(route.kind).toBe("unsupported_app_build");
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
