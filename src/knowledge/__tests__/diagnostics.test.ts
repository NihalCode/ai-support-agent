import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { getKnowledgeDiagnostics } from "../diagnostics/KnowledgeDiagnosticsService";

describe("KnowledgeDiagnosticsService", () => {
  const prevOpenAi = process.env.OPENAI_API_KEY;
  const prevPinecone = process.env.PINECONE_API_KEY;

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.PINECONE_API_KEY;
  });

  afterEach(() => {
    if (prevOpenAi === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevOpenAi;
    if (prevPinecone === undefined) delete process.env.PINECONE_API_KEY;
    else process.env.PINECONE_API_KEY = prevPinecone;
  });

  it("returns false flags when embedding and vector env vars are missing", async () => {
    const diagnostics = await getKnowledgeDiagnostics();

    expect(diagnostics.embeddingConfigured).toBe(false);
    expect(diagnostics.vectorDbConfigured).toBe(false);
    expect(diagnostics.sourceCount).toBeGreaterThan(0);
    expect(diagnostics.enabledSourceCount).toBeGreaterThan(0);
  });

  it("returns true flags when env vars are set", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.PINECONE_API_KEY = "pc-test";

    const diagnostics = await getKnowledgeDiagnostics();

    expect(diagnostics.embeddingConfigured).toBe(true);
    expect(diagnostics.vectorDbConfigured).toBe(true);
  });
});
