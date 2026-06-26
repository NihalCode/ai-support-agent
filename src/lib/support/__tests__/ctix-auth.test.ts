import { describe, it, expect } from "vitest";
import { generateCtixAuthQuery } from "../ctix-auth";

describe("ctix-auth", () => {
  it("generates AccessID, Signature, Expires query params", () => {
    const q = generateCtixAuthQuery("access-id-123", "secret-key", 100);
    expect(q.AccessID).toBe("access-id-123");
    expect(q.Signature).toBeTruthy();
    expect(Number(q.Expires)).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("produces deterministic signature for fixed expiry window", () => {
    const fixed = 1_700_000_000;
    const orig = Date.now;
    Date.now = () => (fixed - 100) * 1000;
    try {
      const q = generateCtixAuthQuery("id", "secret", 100);
      expect(q.Expires).toBe(String(fixed));
      expect(q.Signature).toMatch(/^[A-Za-z0-9+/=]+$/);
    } finally {
      Date.now = orig;
    }
  });
});
