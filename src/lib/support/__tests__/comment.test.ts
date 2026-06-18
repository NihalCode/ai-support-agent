import { describe, it, expect } from "vitest";
import { draftCustomerComment, draftEngineeringNote, suggestTriageMeta } from "../comment";
import type { IssueAnalysis } from "../types";

const base: IssueAnalysis = {
  summary: "summary",
  rootCause: "root cause",
  confidence: "High",
  evidence: ["evidence one"],
  fixability: "engineering-required",
  category: "new-bug",
  fixSteps: ["step one", "step two"],
  codeFix: null,
  questionsForClient: [],
  suggestedTicketResponse: "Hello, here is your fix.",
  escalationNote: "Escalate to engineering.",
  citations: [{ label: "src/x.ts:1-2", sourceType: "code" }],
  retrievedContext: [],
  usedLlm: false,
};

describe("comment drafting", () => {
  it("returns the customer response verbatim", () => {
    expect(draftCustomerComment(base)).toBe("Hello, here is your fix.");
  });

  it("builds an engineering note with root cause, escalation, and sources", () => {
    const note = draftEngineeringNote(base);
    expect(note).toContain("root cause");
    expect(note).toContain("Escalate to engineering.");
    expect(note).toContain("src/x.ts:1-2");
  });

  it("maps fixability to assignee and engineering flag", () => {
    const meta = suggestTriageMeta(base);
    expect(meta.assignee).toBe("engineering");
    expect(meta.needsEngineering).toBe(true);
    expect(meta.labels).toContain("bug");
    expect(meta.priority).toBe("high");
  });

  it("routes client-fixable issues to the client", () => {
    const meta = suggestTriageMeta({ ...base, fixability: "client-can-fix", category: "environment" });
    expect(meta.assignee).toBe("client");
    expect(meta.needsEngineering).toBe(false);
    expect(meta.labels).toContain("configuration");
  });
});
