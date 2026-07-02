import { describe, expect, it } from "vitest";
import { normalizeChatMode, modeBehavior, modeLabel } from "../ModeSelector";
import { routeWorkflow } from "../WorkflowRouter";
import { classifyWithAttachments } from "../IntentClassifier";

describe("ModeSelector", () => {
  it("defaults to balanced", () => {
    expect(normalizeChatMode(undefined, true)).toBe("balanced");
  });

  it("downgrades developer without permission", () => {
    expect(normalizeChatMode("developer", false)).toBe("balanced");
  });

  it("allows developer with permission", () => {
    expect(normalizeChatMode("developer", true)).toBe("developer");
  });

  it("deep mode enables full build verification", () => {
    expect(modeBehavior("deep").fullBuildVerification).toBe(true);
    expect(modeBehavior("instant").fullBuildVerification).toBe(false);
  });

  it("labels modes", () => {
    expect(modeLabel("instant")).toBe("Instant");
  });
});

describe("Unified orchestrator routing", () => {
  it("routes build app intent to unsupported app build", () => {
    const { classification, enrichedMessage } = classifyWithAttachments({
      message: "Build a dashboard from my OpenAPI file",
      context: {},
      attachmentIds: [],
      chatMode: "balanced",
    });
    const route = routeWorkflow(classification, {}, enrichedMessage);
    expect(route.kind).toBe("unsupported_app_build");
    expect(classification.primaryIntent).toBe("build_app");
  });
});
