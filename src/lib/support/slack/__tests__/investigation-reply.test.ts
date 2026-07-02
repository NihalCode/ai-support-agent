import { describe, expect, it } from "vitest";

import type { InvestigateResponse, InvestigationContext } from "@/lib/support/investigation/types";
import {
  extractRunbookBullets,
  formatSlackInvestigationReply,
  isCompoundSupportPrompt,
  wantsCustomerGuidance,
} from "@/lib/support/slack/investigation-reply";
import { classifyUserIntent } from "@/lib/support/intent/classify-intent";

const COMPOUND_PROMPT =
  "Zendesk ZD-12345, Jira PROJ-456. CTIX Open API 401 Unauthorized. Check our runbook and linked tickets — what should support tell the customer?";

function mockInvestigationResult(): InvestigateResponse {
  const context: InvestigationContext = {
    sessionId: "sess-1",
    query: { text: COMPOUND_PROMPT, statusCode: 401, endpoint: "/ingestion/policy/" },
    missingQuestions: [],
    jira: { tickets: [], openMatches: 0, closedMatches: 0, summary: "", mock: true },
    code: { files: [], commits: [], pullRequests: [], summary: "", mock: true },
    logs: { entries: [], patterns: [], summary: "", mock: true },
    deployments: { deployments: [], regressionSuspected: false, summary: "", mock: true },
    docs: {
      docs: [
        {
          id: "doc-1",
          sourceType: "docs",
          title: "Ingestion policy API",
          summary: "GET /ingestion/policy/ returns tenant ingestion policy.",
          url: "https://docs.example.com/ingestion-policy",
          metadata: { method: "GET", path: "/ingestion/policy/" },
        },
        {
          id: "conf-1",
          sourceType: "confluence",
          title: "Runbook: CTIX Open API 401 Unauthorized troubleshooting",
          summary:
            "1. Confirm CTIX tenant URL and Open API Access ID. 2. Regenerate HMAC Signature and Expires. 3. Re-test POST /v3/indicators/search/",
          url: "https://confluence.example.com/runbook-401",
        },
      ],
      summary: "Found API and runbook evidence.",
      mock: false,
    },
    rootCause: {
      likelyCause:
        "Authentication or permissions misconfiguration (invalid token, AccessID, or missing scopes).",
      confidence: "medium",
      severity: "medium",
      category: "configuration",
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
      title: "CTIX 401",
      plainEnglishSummary:
        "Endpoint GET /ingestion/policy/ matches API documentation (GET /ingestion/policy/). Review request against spec and tenant configuration.",
      currentStatus: "configuration-issue",
      severity: "medium",
      confidence: "medium",
      whatWeFound: { jira: "", logs: "", code: "", deployments: "", docs: "" },
      likelyCause: "Authentication misconfiguration.",
      isItFixed: "Unknown.",
      recommendedNextStep:
        "Support: verify Access ID, regenerate Signature/Expires, and re-test Open API. Engineering: trace auth if tenant config is correct.",
      customerResponse:
        "Thank you for your patience. We traced the 401 to expired or mismatched Open API credentials. Please regenerate Signature and Expires in CTIX API Settings and confirm your tenant URL matches your Integrators CSV. We'll stay on the thread until auth succeeds.",
      developerNotes: "",
      jiraTicket: {
        title: "",
        summary: "",
        customerImpact: "",
        suspectedRootCause: "",
        severity: "medium",
        priority: "Medium",
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
  };

  return {
    sessionId: "sess-1",
    report: context.report,
    context,
    needsMoreInfo: false,
    missingQuestions: [],
  };
}

describe("isCompoundSupportPrompt", () => {
  it("detects multi-facet Slack support messages", () => {
    const classification = classifyUserIntent({ message: COMPOUND_PROMPT });
    expect(isCompoundSupportPrompt(COMPOUND_PROMPT, classification)).toBe(true);
  });

  it("does not treat simple error reports as compound", () => {
    const simple = "401 Unauthorized on CTIX Open API since this morning";
    const classification = classifyUserIntent({ message: simple });
    expect(isCompoundSupportPrompt(simple, classification)).toBe(false);
  });
});

describe("wantsCustomerGuidance", () => {
  it("matches support tell-the-customer phrasing", () => {
    const classification = classifyUserIntent({ message: COMPOUND_PROMPT });
    expect(wantsCustomerGuidance(COMPOUND_PROMPT, classification)).toBe(true);
    expect(classification.primaryIntent).toBe("generate_customer_response");
  });
});

describe("formatSlackInvestigationReply", () => {
  it("includes summary, customer guidance, runbook, docs, and tickets for compound prompts", () => {
    const result = mockInvestigationResult();
    const text = formatSlackInvestigationReply({
      userMessage: COMPOUND_PROMPT,
      result,
      ticketNote: "\n\nLinked tickets: Jira PROJ-456 · Zendesk ZD-12345",
      appBase: "https://studio.example.com",
    });

    expect(text).toContain("*Summary*");
    expect(text).toContain("GET /ingestion/policy/");
    expect(text).toContain("*What to tell the customer*");
    expect(text).toContain("regenerate Signature and Expires");
    expect(text).toContain("*Runbook steps*");
    expect(text).toContain("Regenerate HMAC Signature");
    expect(text).toContain("*Recommended next actions*");
    expect(text).toContain("*Relevant docs*");
    expect(text).toContain("Ingestion policy API");
    expect(text).toContain("Linked tickets: Jira PROJ-456");
    expect(text).toContain("Open in AI Support Studio");
  });

  it("keeps simple investigations focused on summary and docs", () => {
    const simple = "401 Unauthorized on CTIX Open API since this morning";
    const result = mockInvestigationResult();
    const text = formatSlackInvestigationReply({
      userMessage: simple,
      result,
      appBase: null,
    });

    expect(text).toContain("*Summary*");
    expect(text).toContain("*Relevant docs*");
    expect(text).not.toContain("*What to tell the customer*");
    expect(text).not.toContain("*Runbook steps*");
  });
});

describe("extractRunbookBullets", () => {
  it("parses numbered runbook steps from Confluence evidence", () => {
    const bullets = extractRunbookBullets(mockInvestigationResult().context);
    expect(bullets.length).toBeGreaterThanOrEqual(2);
    expect(bullets.some((b) => /Regenerate HMAC/i.test(b))).toBe(true);
  });
});
