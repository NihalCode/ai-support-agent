import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { validateAuthConfigPublic } from "@/lib/auth/auth-config-public";

describe("validateAuthConfig", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
    delete process.env.AUTH0_DOMAIN;
    delete process.env.AUTH0_CLIENT_ID;
    delete process.env.AUTH0_CLIENT_SECRET;
    delete process.env.AUTH0_SECRET;
    delete process.env.APP_BASE_URL;
    delete process.env.AUTH0_ACTION_SHARED_SECRET;
    delete process.env.DATABASE_URL;
    delete process.env.INITIAL_OWNER_EMAIL;
    delete process.env.BOOTSTRAP_OWNER_EMAIL;
    delete process.env.VERCEL;
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it("reports missing Auth0 env", () => {
    const result = validateAuthConfigPublic();
    expect(result.ok).toBe(false);
    expect(result.checks.auth0EnvComplete).toBe(false);
    expect(result.issues.some((i) => i.includes("Auth0 env incomplete"))).toBe(true);
  });

  it("reports short AUTH0_SECRET", () => {
    process.env.AUTH0_DOMAIN = "tenant.auth0.com";
    process.env.AUTH0_CLIENT_ID = "client";
    process.env.AUTH0_CLIENT_SECRET = "secret";
    process.env.AUTH0_SECRET = "short";
    process.env.APP_BASE_URL = "https://app.example.com";
    process.env.AUTH0_ACTION_SHARED_SECRET = "action-secret-at-least-32-characters-long";

    const result = validateAuthConfigPublic();
    expect(result.ok).toBe(false);
    expect(result.checks.auth0SecretValid).toBe(false);
  });

  it("accepts INITIAL_OWNER_EMAIL and BOOTSTRAP_OWNER_EMAIL alias", () => {
    process.env.BOOTSTRAP_OWNER_EMAIL = "owner@company.com";
    expect(validateAuthConfigPublic().checks.initialOwnerEmailSource).toBe("BOOTSTRAP_OWNER_EMAIL");

    delete process.env.BOOTSTRAP_OWNER_EMAIL;
    process.env.INITIAL_OWNER_EMAIL = "owner@company.com";
    expect(validateAuthConfigPublic().checks.initialOwnerEmailSource).toBe("INITIAL_OWNER_EMAIL");
  });

  it("passes with complete configuration", () => {
    process.env.AUTH0_DOMAIN = "tenant.auth0.com";
    process.env.AUTH0_CLIENT_ID = "client";
    process.env.AUTH0_CLIENT_SECRET = "secret";
    process.env.AUTH0_SECRET = "a".repeat(32);
    process.env.APP_BASE_URL = "https://app.example.com";
    process.env.AUTH0_ACTION_SHARED_SECRET = "action-secret-at-least-32-characters-long";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/app";
    process.env.INITIAL_OWNER_EMAIL = "owner@company.com";

    const result = validateAuthConfigPublic();
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });
});
