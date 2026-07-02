import { describe, it, expect } from "vitest";
import { shouldFallbackToInvestigate } from "@/lib/support/chat/stream-fallback";

describe("chat stream fallback guard", () => {
  it("skips investigate fallback when stream already produced tokens", () => {
    expect(shouldFallbackToInvestigate(true, "")).toBe(false);
    expect(shouldFallbackToInvestigate(true, "partial")).toBe(false);
  });

  it("allows fallback only when stream never started", () => {
    expect(shouldFallbackToInvestigate(false, "")).toBe(true);
    expect(shouldFallbackToInvestigate(false, "  ")).toBe(true);
    expect(shouldFallbackToInvestigate(false, "hello")).toBe(false);
  });
});
