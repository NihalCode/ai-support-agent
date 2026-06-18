import { describe, it, expect } from "vitest";
import { citationFromChunk } from "../retrieve";
import { hashingEmbedding } from "../embed";
import type { RetrievedChunk } from "../types";

describe("citationFromChunk", () => {
  it("builds a code citation with line range + symbol", () => {
    const c: RetrievedChunk = {
      id: "x",
      score: 0.8,
      text: "code",
      metadata: {
        repo: "acme/checkout-service",
        branch: "main",
        filePath: "src/api/charge.ts",
        language: "typescript",
        sourceType: "code",
        symbol: "charge",
        lineStart: 3,
        lineEnd: 9,
      },
    };
    const cit = citationFromChunk(c);
    expect(cit.label).toContain("src/api/charge.ts:3-9");
    expect(cit.label).toContain("charge");
    expect(cit.filePath).toBe("src/api/charge.ts");
  });

  it("builds a ticket citation with url + ref", () => {
    const c: RetrievedChunk = {
      id: "t",
      score: 0.7,
      text: "issue",
      metadata: {
        repo: "acme/checkout-service",
        branch: "main",
        filePath: "gh#41",
        language: "n/a",
        sourceType: "issue",
        title: "Charge 404",
        url: "https://example.com/41",
      },
    };
    const cit = citationFromChunk(c);
    expect(cit.ref).toBe("gh#41");
    expect(cit.url).toBe("https://example.com/41");
    expect(cit.filePath).toBeUndefined();
  });
});

describe("hashingEmbedding (offline fallback)", () => {
  it("is deterministic and unit-normalized", () => {
    const a = hashingEmbedding("missing stripe secret key");
    const b = hashingEmbedding("missing stripe secret key");
    expect(a).toEqual(b);
    const norm = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("ranks similar text higher than unrelated text", () => {
    const q = hashingEmbedding("charge endpoint returns 404 after upgrade");
    const near = hashingEmbedding("the charge endpoint 404 happens after we upgrade");
    const far = hashingEmbedding("please add paypal support to the roadmap");
    const dot = (x: number[], y: number[]) => x.reduce((s, v, i) => s + v * y[i], 0);
    expect(dot(q, near)).toBeGreaterThan(dot(q, far));
  });
});
