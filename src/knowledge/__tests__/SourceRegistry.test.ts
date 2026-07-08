import { describe, it, expect } from "vitest";

import { listKnowledgeSources } from "../sources/SourceRegistry";

describe("SourceRegistry", () => {
  it("loads CSAP, CFTR, CTIX, Orchestrate, and CQL sources", () => {
    const sources = listKnowledgeSources();
    const ids = sources.map((s) => s.id);

    expect(ids).toContain("cyware-csap");
    expect(ids).toContain("cyware-cftr");
    expect(ids).toContain("cyware-ctix");
    expect(ids).toContain("cyware-orchestrate");
    expect(ids).toContain("cyware-cql");
    expect(ids).toContain("confluence-knowledge");
  });

  it("marks Cyware API sources with correct types", () => {
    const sources = listKnowledgeSources();
    const cftr = sources.find((s) => s.id === "cyware-cftr");
    const ctix = sources.find((s) => s.id === "cyware-ctix");

    expect(cftr?.type).toBe("openapi");
    expect(ctix?.type).toBe("markdown");
    expect(cftr?.enabled).toBe(true);
  });
});
