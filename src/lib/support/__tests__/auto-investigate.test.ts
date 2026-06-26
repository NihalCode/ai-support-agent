import { describe, it, expect } from "vitest";
import {
  enrichSupportQuery,
  missingInfoQuestions,
  extractNaturalLanguageDetails,
  isSupportLikeMessage,
  formatPlainEnglishIntro,
  buildSupportQueryFromDetails,
} from "../investigation/extract-query";
import { planInvestigation } from "../agents/supervisorAgent";
import { inferEndpointsFromDocs } from "../investigation/infer-api";

describe("investigation extract-query", () => {
  it("extracts endpoint and status from vague text", () => {
    const q = enrichSupportQuery({
      text: "POST /v3/indicators/search/ returns 500 since morning",
    });
    expect(q.endpoint).toContain("/v3/indicators");
    expect(q.statusCode).toBe(500);
  });

  it("extracts workflow, ticket, timing, and symptom from natural language", () => {
    const text =
      "Our block malicious IP workflow stops after about half a minute. Ticket AISUPS-1. It started yesterday morning.";
    const details = extractNaturalLanguageDetails(text);
    expect(details.workflowName?.toLowerCase()).toContain("block");
    expect(details.supportTicketId).toBe("AISUPS-1");
    expect(details.approximateStartTime?.toLowerCase()).toContain("yesterday");
    expect(details.symptom?.toLowerCase()).toMatch(/stop|minute|half/);
    expect(details.technicalLevel).toBe("non-technical");
  });

  it("detects non-technical reporters", () => {
    const details = extractNaturalLanguageDetails(
      "I don't really know the technical stuff — can you explain in plain English?"
    );
    expect(details.technicalLevel).toBe("non-technical");
  });

  it("uses plain-English follow-ups for non-technical users with rich context", () => {
    const q = enrichSupportQuery({
      text: "Our block malicious IP workflow stops after about half a minute. Ticket AISUPS-1.",
    });
    const qs = missingInfoQuestions(q);
    expect(qs.some((x) => /error message|loading|every time/i.test(x.question))).toBe(true);
    expect(qs.some((x) => /endpoint/i.test(x.question))).toBe(false);
  });

  it("allows technical follow-ups for technical users", () => {
    const q = enrichSupportQuery({
      text: "POST /v3/foo returns 500",
      technicalLevel: "technical",
    });
    const qs = missingInfoQuestions(q);
    expect(qs.some((x) => /endpoint|request id|timestamp/i.test(x.question))).toBe(true);
  });

  it("does not block when issue ref provided", () => {
    const qs = missingInfoQuestions(enrichSupportQuery({ text: "help", issueRef: "AISUP5-1" }));
    expect(qs.length).toBeGreaterThanOrEqual(0);
    const plan = planInvestigation(enrichSupportQuery({ text: "help", issueRef: "AISUP5-1" }));
    expect(plan.canProceed).toBe(true);
  });

  it("isSupportLikeMessage accepts support issues without endpoint", () => {
    expect(
      isSupportLikeMessage(
        "Our block malicious IP workflow stops after about half a minute. Ticket AISUPS-1."
      )
    ).toBe(true);
    expect(isSupportLikeMessage("hi")).toBe(false);
  });

  it("formatPlainEnglishIntro includes understood details", () => {
    const text = "Block malicious IP workflow hangs. AISUPS-1.";
    const details = extractNaturalLanguageDetails(text);
    const query = buildSupportQueryFromDetails(details, text);
    const intro = formatPlainEnglishIntro(details, query, missingInfoQuestions(query));
    expect(intro).toMatch(/What I understood/i);
    expect(intro).toMatch(/AISUPS-1/);
    expect(intro).not.toMatch(/Start an investigation first/i);
  });
});

describe("supervisorAgent auto-investigate", () => {
  it("proceeds for natural-language workflow issues without endpoint", () => {
    const plan = planInvestigation(
      enrichSupportQuery({
        text: "Our block malicious IP workflow stops after about half a minute. Ticket AISUPS-1.",
      })
    );
    expect(plan.canProceed).toBe(true);
    expect(plan.agents).toContain("jira");
  });

  it("routes CQL-related workflow queries to cql agent and proceeds", () => {
    const plan = planInvestigation({ text: "Write a CQL query for malicious IPs" });
    expect(plan.agents).toContain("cql");
    expect(plan.canProceed).toBe(true);
  });

  it("proceeds when endpoint provided", () => {
    const plan = planInvestigation({
      text: "POST /v3/tags/bulk/ returns 503",
      endpoint: "/v3/tags/bulk/",
      statusCode: 503,
    });
    expect(plan.canProceed).toBe(true);
    expect(plan.agents).toContain("logs");
  });
});

describe("infer-api", () => {
  it("does not require endpoint to return empty array safely", () => {
    const paths = inferEndpointsFromDocs({ text: "something completely unrelated xyz" });
    expect(Array.isArray(paths)).toBe(true);
  });
});

describe("ensureInvestigationSession", () => {
  it("reuses existing session when provided", async () => {
    const { saveSession } = await import("../investigation/session-store");
    const sessionId = "test-session-reuse-" + Date.now();
    await saveSession({
      sessionId,
      query: { text: "existing" },
      missingQuestions: [],
      jira: { tickets: [], openMatches: 0, closedMatches: 0, summary: "", mock: true },
      code: { files: [], commits: [], pullRequests: [], summary: "", mock: true },
      logs: { entries: [], patterns: [], summary: "", mock: true },
      deployments: { deployments: [], regressionSuspected: false, summary: "", mock: true },
      docs: { docs: [], summary: "", mock: true },
      rootCause: {
        likelyCause: "test",
        confidence: "low",
        severity: "low",
        category: "unknown",
        evidenceIds: [],
      },
      fixProposal: {
        fixable: false,
        suspectedRootCause: "",
        affectedFiles: [],
        testPlan: [],
        rollbackPlan: "",
        riskLevel: "low",
        confidence: "low",
        requiresHumanReview: true,
      },
      report: {
        title: "Existing",
        plainEnglishSummary: "Existing",
        currentStatus: "needs-more-information",
        severity: "low",
        confidence: "low",
        whatWeFound: { jira: "", logs: "", code: "", deployments: "", docs: "" },
        likelyCause: "",
        isItFixed: "",
        recommendedNextStep: "",
        customerResponse: "",
        developerNotes: "",
        jiraTicket: {
          title: "",
          summary: "",
          customerImpact: "",
          suspectedRootCause: "",
          severity: "low",
          priority: "Low",
          linkedTickets: [],
          relatedFiles: [],
          acceptanceCriteria: [],
          questionsForCustomer: [],
          status: "not-created",
        },
      },
      evidence: [],
      chatHistory: [],
      modes: { jira: "mock", github: "mock", vercel: "mock", vectors: "mock" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const { ensureInvestigationSession } = await import("../investigation/ensure-investigation");
    const result = await ensureInvestigationSession({
      userMessage: "follow up question",
      currentSessionId: sessionId,
    });
    expect(result.sessionId).toBe(sessionId);
    expect(result.report.title).toBe("Existing");
  });
});
