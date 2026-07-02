import { describe, expect, it, beforeEach } from "vitest";
import {
  createInvestigation,
  patchInvestigation,
  exportInvestigationMarkdown,
  listInvestigations,
} from "@/lib/support/investigation/object-store";

describe("investigation object store", () => {
  beforeEach(() => {
    listInvestigations().forEach((_inv) => {
      /* fresh map per test file run — global store persists in process */
    });
  });

  it("creates and patches investigation", () => {
    const inv = createInvestigation({ title: "Test", userIssue: "API 400" });
    const updated = patchInvestigation(inv.id, {
      pinEvidence: "ev-1",
      evidence: [
        {
          id: "ev-1",
          sourceType: "api-doc",
          sourceName: "CTIX",
          title: "Bulk tags",
          summary: "POST /v3/tags/bulk/",
          timestamp: new Date().toISOString(),
        },
      ],
      addHypothesis: {
        title: "Missing field",
        description: "name required",
        status: "active",
        confidence: "medium",
        evidenceIds: [],
      },
    });
    expect(updated?.pinnedEvidence).toContain("ev-1");
    expect(updated?.hypotheses.length).toBe(1);
  });

  it("accepts hypothesis as root cause", () => {
    const inv = createInvestigation({ title: "H", userIssue: "issue" });
    patchInvestigation(inv.id, {
      addHypothesis: { title: "Regression", description: "deploy", status: "active", confidence: "high", evidenceIds: [] },
    });
    const h = listInvestigations()[0].hypotheses[0];
    const updated = patchInvestigation(inv.id, {
      updateHypothesis: { id: h.id, status: "accepted" },
    });
    expect(updated?.suspectedRootCause).toBe("Regression");
  });

  it("exports markdown", () => {
    const inv = createInvestigation({ title: "Export test", userIssue: "Bug" });
    const md = exportInvestigationMarkdown(inv);
    expect(md).toContain("Export test");
    expect(md).toContain("Bug");
  });
});
