import { describe, it, expect } from "vitest";
import { enrichSupportQuery, missingInfoQuestions } from "../investigation/extract-query";
import { planInvestigation } from "../agents/supervisorAgent";
import { runRootCauseAgent } from "../agents/rootCauseAgent";
import { runJiraTicketWriterAgent } from "../agents/jiraTicketWriterAgent";

describe("investigation extract-query", () => {
  it("extracts endpoint and status from vague text", () => {
    const q = enrichSupportQuery({
      text: "POST /v3/indicators/search/ returns 500 since morning",
    });
    expect(q.endpoint).toContain("/v3/indicators");
    expect(q.statusCode).toBe(500);
  });

  it("asks focused questions for very vague queries", () => {
    const qs = missingInfoQuestions({ text: "API not working" });
    expect(qs.length).toBeGreaterThan(0);
    expect(qs[0].question).toMatch(/describe|endpoint|wrong/i);
  });

  it("does not block when issue ref provided", () => {
    const q = enrichSupportQuery({ text: "help", issueRef: "AISUP5-1" });
    const plan = planInvestigation(q);
    expect(plan.canProceed).toBe(true);
  });
});

describe("rootCauseAgent", () => {
  const empty = {
    tickets: [],
    openMatches: 0,
    closedMatches: 0,
    summary: "",
    mock: true,
  };
  const code = { files: [], commits: [], pullRequests: [], summary: "", mock: true };
  const logs = { entries: [], patterns: [] as string[], summary: "", mock: true };
  const deploy = { deployments: [], regressionSuspected: false, summary: "", mock: true };
  const docs = { docs: [], summary: "", mock: false };

  it("detects duplicate from jira agent", () => {
    const r = runRootCauseAgent({
      query: { text: "indicator search 500" },
      jira: { ...empty, duplicateOf: "BUG-1", summary: "dup" },
      code,
      logs,
      deployments: deploy,
      docs,
    });
    expect(r.data.category).toBe("duplicate");
  });

  it("detects 503 regression with deploy and docs evidence", () => {
    const r = runRootCauseAgent({
      query: {
        text: "Started after latest Vercel deploy. POST /v3/tags/bulk/ upstream timeout.",
        endpoint: "/v3/tags/bulk/",
        statusCode: 503,
        requestId: "req_final_test_001",
        errorMessage: "Service Unavailable — upstream timeout",
      },
      jira: empty,
      code,
      logs: { ...logs, patterns: ["5xx server errors", "timeouts"] },
      deployments: {
        deployments: [{ id: "dpl-1", sourceType: "deployment", title: "Deployment dpl_71yf", summary: "READY" }],
        regressionSuspected: true,
        summary: "",
        mock: false,
      },
      docs: {
        docs: [
          {
            id: "doc-0",
            sourceType: "docs",
            title: "Bulk Tags",
            summary: "POST /v3/tags/bulk/",
            metadata: { method: "POST", path: "/v3/tags/bulk/" },
          },
        ],
        summary: "",
        mock: false,
      },
    });
    expect(r.data.category).toBe("regression");
    expect(r.data.confidence).not.toBe("low");
    expect(r.data.likelyCause).toMatch(/503|regression|deploy/i);
  });

  it("blocks jira create on duplicate", () => {
    const draft = runJiraTicketWriterAgent({
      query: { text: "x" },
      jira: { ...empty, duplicateOf: "BUG-1" },
      rootCause: {
        likelyCause: "dup",
        confidence: "high",
        severity: "medium",
        category: "duplicate",
        evidenceIds: [],
      },
      fix: {
        fixable: false,
        suspectedRootCause: "",
        affectedFiles: [],
        testPlan: [],
        rollbackPlan: "",
        riskLevel: "low",
        confidence: "low",
        requiresHumanReview: true,
      },
      code,
      logs,
    });
    expect(draft.data.status).toBe("duplicate-blocked");
  });
});
