import { describe, it, expect } from "vitest";
import { runAllTestCases } from "../eval/run";
import { TEST_CASES } from "../eval/test-cases";

/**
 * End-to-end offline test: ingests the mock repo into the in-memory vector
 * store (hashing embeddings, no network) and runs all 8 example cases through
 * the full retrieve → classify pipeline in deterministic heuristic mode.
 */
describe("8 example support test cases (offline, heuristic mode)", () => {
  it("classifies every case within expected categories + fixabilities", async () => {
    const summary = await runAllTestCases();
    expect(summary.total).toBe(TEST_CASES.length);

    const failures = summary.results.filter((r) => !r.pass);
    if (failures.length) {
      // Surface useful detail when a case regresses.
      const detail = failures
        .map((f) => `${f.id}: ${f.reasons.join("; ")}`)
        .join("\n");
      throw new Error(`Test cases failed:\n${detail}`);
    }
    expect(summary.passed).toBe(summary.total);
  }, 30_000);
});
