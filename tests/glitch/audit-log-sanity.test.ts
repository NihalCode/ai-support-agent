import { describe, it, expect } from "vitest";
import { redact } from "@/lib/support/redact";

describe("audit log sanity", () => {
  it("redacts secrets from audit detail strings", () => {
    const out = redact("token sk-abcdefghijklmnopqrstuvwxyz1234567890");
    expect(out).not.toContain("sk-abcdefghijklmnopqrstuvwxyz1234567890");
    expect(out).toMatch(/redacted|•+|\[REDACTED\]/i);
  });

  it("does not emit undefined placeholders in redact output", () => {
    expect(redact("")).toBe("");
    expect(redact("plain text")).toBe("plain text");
    expect(redact("plain text")).not.toMatch(/undefined|null|\[object Object\]/);
  });
});
