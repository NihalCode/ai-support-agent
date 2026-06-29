import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("resolveIntegrationCredentials", () => {
  const originalCwd = process.cwd();
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "resolve-creds-"));
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    process.env.INTEGRATION_SECRET_KEY = "test-secret-key-for-aes-gcm-store";
    delete process.env.JIRA_BASE_URL;
    delete process.env.JIRA_EMAIL;
    delete process.env.JIRA_API_TOKEN;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    delete process.env.INTEGRATION_SECRET_KEY;
    delete process.env.JIRA_BASE_URL;
    delete process.env.JIRA_EMAIL;
    delete process.env.JIRA_API_TOKEN;
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("prefers stored credentials over env for Jira", async () => {
    process.env.JIRA_BASE_URL = "https://env.atlassian.net";
    process.env.JIRA_EMAIL = "env@example.com";
    process.env.JIRA_API_TOKEN = "env-token";

    const { CredentialStore } = await import("@/integrations/core/CredentialStore");
    await CredentialStore.save(
      "jira",
      {
        baseUrl: "https://store.atlassian.net",
        email: "store@example.com",
        apiToken: "store-token",
      },
      "default",
      "user-1"
    );

    const { resolveJiraCredentials, jiraCredentialsConfigured } = await import(
      "@/integrations/core/resolveIntegrationCredentials"
    );
    const creds = await resolveJiraCredentials("default");
    expect(creds.baseUrl).toBe("https://store.atlassian.net");
    expect(creds.email).toBe("store@example.com");
    expect(creds.apiToken).toBe("store-token");
    expect(jiraCredentialsConfigured(creds)).toBe(true);
  });

  it("falls back to env when store is empty", async () => {
    process.env.JIRA_BASE_URL = "https://env.atlassian.net";
    process.env.JIRA_EMAIL = "env@example.com";
    process.env.JIRA_API_TOKEN = "env-token";

    const { resolveJiraCredentials } = await import(
      "@/integrations/core/resolveIntegrationCredentials"
    );
    const creds = await resolveJiraCredentials("default");
    expect(creds.baseUrl).toBe("https://env.atlassian.net");
    expect(creds.email).toBe("env@example.com");
    expect(creds.apiToken).toBe("env-token");
  });
});
