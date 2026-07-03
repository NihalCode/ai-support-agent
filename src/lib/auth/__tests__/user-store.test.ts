import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("user-store invite-only", () => {
  const originalCwd = process.cwd();
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "user-store-invite-"));
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("does not auto-create user on upsertUserFromLogin", async () => {
    const { upsertUserFromLogin, getUserById } = await import("@/lib/auth/user-store");
    const result = await upsertUserFromLogin({
      id: "auth0|new",
      email: "new@example.com",
    });
    expect(result).toBeNull();
    expect(await getUserById("auth0|new")).toBeNull();
  });

  it("createUserFromInvite assigns role from invite", async () => {
    const { createUserFromInvite, getUserById } = await import("@/lib/auth/user-store");
    const user = await createUserFromInvite({
      id: "auth0|invited",
      email: "invited@example.com",
      role: "support_agent",
      invitedByUserId: "admin-1",
    });
    expect(user.role).toBe("support_agent");
    const loaded = await getUserById("auth0|invited");
    expect(loaded?.role).toBe("support_agent");
    expect(loaded?.invitedByUserId).toBe("admin-1");
  });

  it("updates existing user on upsertUserFromLogin", async () => {
    const { createUserFromInvite, upsertUserFromLogin } = await import("@/lib/auth/user-store");
    await createUserFromInvite({
      id: "auth0|1",
      email: "user@example.com",
      role: "viewer",
    });
    const updated = await upsertUserFromLogin({
      id: "auth0|1",
      email: "user@example.com",
      name: "Updated Name",
    });
    expect(updated?.name).toBe("Updated Name");
  });

  it("relinks an existing user to a new Auth0 subject for the same email", async () => {
    const { createUserFromInvite, relinkUserAuthSubject, getUserById } = await import(
      "@/lib/auth/user-store"
    );
    await createUserFromInvite({
      id: "google-oauth2|abc",
      email: "user@example.com",
      role: "viewer",
    });

    const relinked = await relinkUserAuthSubject({
      previousId: "google-oauth2|abc",
      auth0Sub: "auth0|xyz",
      email: "user@example.com",
      name: "User Updated",
    });

    expect(relinked?.id).toBe("auth0|xyz");
    expect(relinked?.name).toBe("User Updated");
    expect(await getUserById("google-oauth2|abc")).toBeNull();
    expect(await getUserById("auth0|xyz")).not.toBeNull();
  });

  it("applyInviteToExistingUser reactivates disabled user and updates role", async () => {
    const {
      createUserFromInvite,
      setUserStatus,
      applyInviteToExistingUser,
      getUserById,
    } = await import("@/lib/auth/user-store");
    await createUserFromInvite({
      id: "auth0|reinvite-user",
      email: "reinvite-user@example.com",
      role: "viewer",
    });
    await setUserStatus("auth0|reinvite-user", "disabled");

    const upgraded = await applyInviteToExistingUser({
      id: "auth0|reinvite-user",
      role: "admin",
      invitedByUserId: "owner-1",
    });

    expect(upgraded?.status).toBe("active");
    expect(upgraded?.role).toBe("admin");
    const loaded = await getUserById("auth0|reinvite-user");
    expect(loaded?.status).toBe("active");
    expect(loaded?.role).toBe("admin");
  });
});
