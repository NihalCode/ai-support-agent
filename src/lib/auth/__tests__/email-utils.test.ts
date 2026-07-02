import { describe, expect, it } from "vitest";

import { normalizeEmail, isValidEmail, emailDomain } from "@/lib/auth/email-utils";

describe("email-utils", () => {
  it("normalizes email to lowercase trimmed", () => {
    expect(normalizeEmail("  User@Example.COM ")).toBe("user@example.com");
  });

  it("validates email format", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
  });

  it("extracts email domain", () => {
    expect(emailDomain("user@Company.COM")).toBe("company.com");
  });
});
