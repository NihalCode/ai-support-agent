import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  classifyUserIntent,
  shouldRouteToBuildAppFromIntent,
  shouldAutoInvestigateFromIntent,
  classifyBuildAppWorkspaceMessage,
} from "../intent/classify-intent";
import { chooseAgentRoute } from "../intent/choose-route";
import type { UserIntent, WorkspaceIntentContext } from "../intent/types";

interface FixtureCase {
  message: string;
  expectedIntent: UserIntent;
  context?: WorkspaceIntentContext;
}

interface FixtureFile {
  cases: FixtureCase[];
}

const fixturePath = path.join(process.cwd(), "tests/fixtures/natural-language-intents.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as FixtureFile;

describe("intent classification — natural language examples", () => {
  it("loads fixture with 100+ cases", () => {
    expect(fixture.cases.length).toBeGreaterThanOrEqual(100);
  });

  it("meets 90%+ primary intent accuracy on fixture", () => {
    let correct = 0;
    const mismatches: string[] = [];
    for (const c of fixture.cases) {
      const result = classifyUserIntent({ message: c.message, context: c.context ?? {} });
      const deployFamily = new Set(["preview_app", "deploy_app"]);
      const ok =
        result.primaryIntent === c.expectedIntent ||
        (deployFamily.has(c.expectedIntent) && deployFamily.has(result.primaryIntent)) ||
        (c.expectedIntent === "unsupported_app_build_request" &&
          result.primaryIntent === "unsupported_app_build_request");
      if (ok) {
        correct += 1;
      } else {
        mismatches.push(
          `"${c.message.slice(0, 60)}…" expected ${c.expectedIntent}, got ${result.primaryIntent}`
        );
      }
    }
    const accuracy = correct / fixture.cases.length;
    if (mismatches.length > 0 && accuracy < 0.9) {
      console.log("Mismatches (first 10):", mismatches.slice(0, 10));
    }
    expect(accuracy).toBeGreaterThanOrEqual(0.9);
  });
});

describe("intent classification — specific scenarios", () => {
  it("deterministically routes explicit Zendesk historical research", () => {
    const message =
      "A customer is seeing CTIX package list with no indicator count on export. " +
      "They mentioned it started after a recent upgrade. " +
      "Can you find similar Zendesk tickets and summarize what we did before?";
    const result = classifyUserIntent({ message });

    expect(result.primaryIntent).toBe("support.ticket_research");
    expect(result.provider).toBe("zendesk");
    expect(result.confidence).toBe("high");
    expect(result.needsClarification).toBe(false);
    expect(result.extractedEntities.apiProduct).toBe("CTIX");
    expect(result.extractedEntities.keywords).toContain("indicator");
  });

  it.each([
    "Search Zendesk ticket history for package export failures",
    "Find previous Zendesk tickets and summarize prior resolutions",
    "Review related customer cases in Zendesk and tell me what we did before",
  ])("explicit Zendesk research never returns unknown: %s", (message) => {
    const result = classifyUserIntent({ message });
    expect(result.primaryIntent).toBe("support.ticket_research");
    expect(result.primaryIntent).not.toBe("unknown");
    expect(result.needsClarification).toBe(false);
  });

  it("build app from non-keyword text", () => {
    const r = classifyUserIntent({
      message:
        "I need a small internal tool where analysts can search indicators and click into details.",
    });
    expect(r.primaryIntent).toBe("unsupported_app_build_request");
    expect(r.confidence).not.toBe("low");
  });

  it("edit app from vague client-ready text with active project", () => {
    const r = classifyUserIntent({
      message: "This looks too much like a demo. Make it client-ready.",
      context: { buildProjectId: "p1" },
    });
    expect(r.primaryIntent).toBe("edit_app");
  });

  it("manager-ready phrasing routes to edit_app", () => {
    const r = classifyUserIntent({
      message: "This page still looks like a rough demo. Can you make it something I can show my manager?",
      context: { buildProjectId: "p1" },
    });
    expect(r.primaryIntent).toBe("edit_app");
    expect(r.needsClarification).toBe(false);
  });

  it("deploy intent from share-with-team phrasing", () => {
    const r = classifyUserIntent({
      message: "Can I share this with my team?",
      context: { buildProjectId: "p1", buildOk: true },
    });
    expect(["preview_app", "deploy_app"]).toContain(r.primaryIntent);
  });

  it("put on internet routes to preview/deploy", () => {
    const r = classifyUserIntent({
      message: "Can you put this on the internet so my team can try it?",
      context: { buildProjectId: "p1" },
    });
    expect(["preview_app", "deploy_app"]).toContain(r.primaryIntent);
  });

  it("support investigation from non-technical issue", () => {
    const r = classifyUserIntent({
      message: "The thing that blocks bad IPs is freezing and nobody knows why.",
    });
    expect(r.primaryIntent).toBe("diagnose_support_issue");
  });

  it("customer response from what should I tell them", () => {
    const r = classifyUserIntent({
      message: "What should I tell the customer?",
      context: { sessionId: "s1" },
    });
    expect(r.primaryIntent).toBe("generate_customer_response");
  });

  it("developer handoff from engineering phrasing", () => {
    const r = classifyUserIntent({
      message: "Give me something I can send to engineering.",
      context: { sessionId: "s1" },
    });
    expect(r.primaryIntent).toBe("generate_developer_handoff");
  });

  it("CQL generation from natural request", () => {
    const r = classifyUserIntent({
      message: "I want to find indicators from the last week with high confidence.",
    });
    expect(r.primaryIntent).toBe("generate_cql");
  });

  it("fix error from fix that with failed build context", () => {
    const r = classifyUserIntent({
      message: "Fix that error.",
      context: { buildProjectId: "p1", buildOk: false, buildFailed: true },
    });
    expect(r.primaryIntent).toBe("fix_error");
  });

  it("slash command forces intent", () => {
    const r = classifyUserIntent({ message: "/investigate workflow timeout" });
    expect(r.primaryIntent).toBe("diagnose_support_issue");
    expect(r.forcedBySlash).toBe("/investigate");
  });

  it("low confidence offers clarification choices when unknown", () => {
    const r = classifyUserIntent({ message: "hmm" });
    expect(r.primaryIntent).toBe("unknown");
    expect(r.needsClarification).toBe(true);
    expect(r.clarificationChoices?.length).toBeGreaterThan(0);
  });
});

describe("intent routing", () => {
  it("routes Zendesk ticket research directly without clarification", () => {
    const message = "Find similar Zendesk tickets and summarize what we did before";
    const classification = classifyUserIntent({ message });
    expect(classification.recommendedRoute).toBe("zendesk:ticket-research");
    expect(classification.provider).toBe("zendesk");
    expect(classification.needsClarification).toBe(false);
  });

  it("routes active app vague UI to unsupported app build", () => {
    const classification = classifyUserIntent({
      message: "Make this client-ready.",
      context: { buildProjectId: "p1" },
    });
    const route = chooseAgentRoute(classification, { buildProjectId: "p1" });
    expect(route.kind).toBe("unsupported_app_build");
    expect(shouldRouteToBuildAppFromIntent(classification, { buildProjectId: "p1" })).toBe(false);
  });

  it("routes share request to unsupported app build with active project", () => {
    const classification = classifyUserIntent({
      message: "Can I share this with my team?",
      context: { buildProjectId: "p1", buildOk: true },
    });
    const route = chooseAgentRoute(classification, { buildProjectId: "p1" });
    expect(route.kind).toBe("unsupported_app_build");
  });

  it("routes support issue to investigation create", () => {
    const classification = classifyUserIntent({
      message: "The automation that blocks malicious IPs stopped working yesterday.",
    });
    expect(shouldAutoInvestigateFromIntent(classification, {})).toBe(true);
    const route = chooseAgentRoute(classification, {});
    expect(route.kind).toBe("investigation_create");
  });

  it("routes customer response with active session", () => {
    const classification = classifyUserIntent({
      message: "What should I tell them?",
      context: { sessionId: "s1" },
    });
    const route = chooseAgentRoute(classification, { sessionId: "s1" });
    expect(route.kind).toBe("investigation_customer_response");
  });

  it("build workspace classifies deploy without exact keyword deploy", () => {
    const r = classifyBuildAppWorkspaceMessage("Can my team try this online?", {
      hasProject: true,
      buildOk: true,
    });
    expect(["preview_app", "deploy_app", "unsupported_app_build_request"]).toContain(r.primaryIntent);
  });
});

describe("safety — deploy never auto-executes from classification alone", () => {
  it("deploy intent routes to unsupported app build, not direct execute", () => {
    const r = classifyUserIntent({
      message: "Just publish it.",
      context: { buildProjectId: "p1", buildOk: true },
    });
    expect(r.primaryIntent).toBe("deploy_app");
    const route = chooseAgentRoute(r, { buildProjectId: "p1", buildOk: true });
    expect(route.kind).toBe("unsupported_app_build");
  });
});
