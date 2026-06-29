import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("user-store", () => {
  const originalCwd = process.cwd();
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "user-store-"));
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("first login user becomes owner", async () => {
    const { upsertUserFromLogin, getUserById } = await import("@/lib/auth/user-store");
    const user = await upsertUserFromLogin({
      id: "auth0|1",
      email: "owner@example.com",
      name: "Owner",
    });
    expect(user.role).toBe("owner");
    const loaded = await getUserById("auth0|1");
    expect(loaded?.role).toBe("owner");
  });

  it("second login user defaults to viewer", async () => {
    const { upsertUserFromLogin } = await import("@/lib/auth/user-store");
    await upsertUserFromLogin({ id: "auth0|1", email: "owner@example.com" });
    const second = await upsertUserFromLogin({ id: "auth0|2", email: "new@example.com" });
    expect(second.role).toBe("viewer");
  });
});
