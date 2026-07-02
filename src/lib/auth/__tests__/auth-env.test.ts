import { describe, expect, it } from "vitest";

import {
  authEnvValidationError,
  cleanEnvValue,
  getAuthEnv,
  isAuthEnvComplete,
  normalizeAppBaseUrl,
  validateAuthSecret,
} from "@/lib/auth/env";

describe("auth env helpers", () => {
  it("strips wrapping quotes from env values", () => {
    expect(cleanEnvValue('"https://example.com"')).toBe("https://example.com");
    expect(cleanEnvValue("'secret-value'")).toBe("secret-value");
  });

  it("normalizes APP_BASE_URL without trailing slash", () => {
    expect(normalizeAppBaseUrl("https://ai-support-agent-ecru.vercel.app/")).toBe(
      "https://ai-support-agent-ecru.vercel.app"
    );
  });

  it("requires APP_BASE_URL for complete auth env", () => {
    const env = {
      domain: "tenant.us.auth0.com",
      clientId: "id",
      clientSecret: "secret",
      secret: "a".repeat(32),
      appBaseUrl: null,
    };
    expect(isAuthEnvComplete(env)).toBe(false);
    expect(authEnvValidationError(env)).toMatch(/APP_BASE_URL/);
  });

  it("rejects short AUTH0_SECRET", () => {
    expect(validateAuthSecret("short")).toMatch(/32/);
    expect(validateAuthSecret("a".repeat(32))).toBeNull();
  });

  it("reads auth env from process.env", () => {
    const prev = { ...process.env };
    process.env.AUTH0_DOMAIN = " tenant.us.auth0.com ";
    process.env.AUTH0_CLIENT_ID = "cid";
    process.env.AUTH0_CLIENT_SECRET = "csec";
    process.env.AUTH0_SECRET = "x".repeat(32);
    process.env.APP_BASE_URL = "https://app.example.com/";

    expect(getAuthEnv()).toEqual({
      domain: "tenant.us.auth0.com",
      clientId: "cid",
      clientSecret: "csec",
      secret: "x".repeat(32),
      appBaseUrl: "https://app.example.com",
    });

    process.env = prev;
  });
});
