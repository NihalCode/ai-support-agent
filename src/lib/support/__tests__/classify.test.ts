import { describe, it, expect } from "vitest";
import { classifyHeuristic } from "../classify";
import type { RetrievedChunk, ChunkMetadata } from "../types";

function chunk(partial: {
  id: string;
  score?: number;
  text?: string;
  metadata?: Partial<ChunkMetadata>;
}): RetrievedChunk {
  return {
    id: partial.id,
    score: partial.score ?? 0.5,
    text: partial.text ?? "",
    metadata: {
      repo: "acme/checkout-service",
      branch: "main",
      filePath: partial.metadata?.filePath ?? "src/x.ts",
      language: partial.metadata?.language ?? "typescript",
      sourceType: partial.metadata?.sourceType ?? "code",
      ...partial.metadata,
    },
  };
}

describe("classifyHeuristic — A–K shape", () => {
  it("produces a complete, well-typed report", () => {
    const r = classifyHeuristic("the app crashes", null, []);
    expect(typeof r.summary).toBe("string");
    expect(typeof r.rootCause).toBe("string");
    expect(["High", "Medium", "Low"]).toContain(r.confidence);
    expect(Array.isArray(r.evidence)).toBe(true);
    expect(Array.isArray(r.fixSteps)).toBe(true);
    expect(Array.isArray(r.questionsForClient)).toBe(true);
    expect(typeof r.suggestedTicketResponse).toBe("string");
    expect(Array.isArray(r.citations)).toBe(true);
  });
});

describe("classifyHeuristic — classification", () => {
  it("flags a missing env var as client-fixable environment issue", () => {
    const r = classifyHeuristic(
      "App crashes with 'Missing STRIPE_SECRET_KEY. See README env table.'",
      null,
      []
    );
    expect(r.category).toBe("environment");
    expect(r.fixability).toBe("client-can-fix");
    expect(r.fixSteps.join(" ")).toMatch(/STRIPE_SECRET_KEY/);
  });

  it("classifies a feature request as engineering/not-doable", () => {
    const r = classifyHeuristic("Please add support for PayPal payments. On the roadmap?", null, []);
    expect(r.category).toBe("feature-request");
    expect(["engineering-required", "not-doable"]).toContain(r.fixability);
  });

  it("returns not-enough-info for low-information complaints", () => {
    const r = classifyHeuristic("it broke", null, []);
    expect(r.category).toBe("unknown");
    expect(r.fixability).toBe("not-enough-info");
    expect(r.questionsForClient.length).toBeGreaterThan(0);
  });

  it("detects an already-fixed issue from a closed ticket", () => {
    const evidence = chunk({
      id: "t1",
      score: 0.9,
      text: "GITHUB gh#41: Charge 404 after upgrade. State: closed. Fix: migrate to /v2.",
      metadata: { sourceType: "issue", filePath: "gh#41", title: "Charge 404", language: "n/a" },
    });
    const r = classifyHeuristic("charge endpoint returns 404 after upgrade", null, [evidence]);
    expect(r.category).toBe("known-bug");
    expect(r.fixability).toBe("client-can-fix");
    expect(r.evidence.join(" ").toLowerCase()).toMatch(/already|fix/);
  });

  it("treats 403 errors as permissions, client-fixable", () => {
    const r = classifyHeuristic("API returns 403 Forbidden with our token", null, []);
    expect(r.category).toBe("permissions");
    expect(r.fixability).toBe("client-can-fix");
  });

  it("escalates a likely new bug to engineering", () => {
    const r = classifyHeuristic(
      "Intermittent exception with a stack trace we cannot explain, crashes randomly",
      null,
      []
    );
    expect(["new-bug"]).toContain(r.category);
    expect(r.fixability).toBe("engineering-required");
    expect(r.escalationNote).toBeTruthy();
  });
});
