import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("CredentialStore", () => {
  const originalCwd = process.cwd();
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "cred-store-"));
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    process.env.INTEGRATION_SECRET_KEY = "test-secret-key-for-aes-gcm-store";
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    delete process.env.INTEGRATION_SECRET_KEY;
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("encrypts and loads credentials", async () => {
    const { CredentialStore } = await import("@/integrations/core/CredentialStore");
    await CredentialStore.save(
      "jira",
      { baseUrl: "https://example.atlassian.net", apiToken: "secret" },
      "default",
      "user-1"
    );
    const loaded = await CredentialStore.load("jira", "default");
    expect(loaded).toEqual({
      baseUrl: "https://example.atlassian.net",
      apiToken: "secret",
    });
  });

  it("lists configured integrations for org", async () => {
    const { CredentialStore } = await import("@/integrations/core/CredentialStore");
    await CredentialStore.save("slack", { token: "x" }, "default", "user-1");
    const ids = await CredentialStore.listConfigured("default");
    expect(ids).toContain("slack");
  });
});
