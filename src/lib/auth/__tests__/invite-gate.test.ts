import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("invite-gate", () => {
  const originalCwd = process.cwd();
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "invite-gate-"));
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    delete process.env.BOOTSTRAP_OWNER_EMAIL;
    delete process.env.INITIAL_OWNER_EMAIL;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("allows active user", async () => {
    const { createUserFromInvite } = await import("@/lib/auth/user-store");
    const { checkEmailAccess } = await import("@/lib/auth/invite-gate");
    await createUserFromInvite({
      id: "auth0|active",
      email: "active@example.com",
      role: "viewer",
    });
    const result = await checkEmailAccess("active@example.com");
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("active_user");
  });

  it("blocks disabled user", async () => {
    const { createUserFromInvite, setUserStatus } = await import("@/lib/auth/user-store");
    const { checkEmailAccess } = await import("@/lib/auth/invite-gate");
    const user = await createUserFromInvite({
      id: "auth0|disabled",
      email: "disabled@example.com",
      role: "viewer",
    });
    await setUserStatus(user.id, "disabled");
    const result = await checkEmailAccess("disabled@example.com");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("disabled");
  });

  it("allows valid pending invite", async () => {
    const { createInvite } = await import("@/lib/auth/invite-store");
    const { checkEmailAccess } = await import("@/lib/auth/invite-gate");
    await createInvite({
      email: "invited@gmail.com",
      role: "admin",
      invitedByUserId: "owner-1",
    });
    const result = await checkEmailAccess("invited@gmail.com");
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("valid_invite");
    expect(result.role).toBe("admin");
  });

  it("blocks uninvited email", async () => {
    const { checkEmailAccess } = await import("@/lib/auth/invite-gate");
    const result = await checkEmailAccess("random@gmail.com");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("not_invited");
  });

  it("blocks expired invite", async () => {
    const { createInvite, revokeInvite } = await import("@/lib/auth/invite-store");
    const { checkEmailAccess } = await import("@/lib/auth/invite-gate");
    const { invite } = await createInvite({
      email: "expired@example.com",
      role: "viewer",
      invitedByUserId: "owner-1",
      expiryDays: -1,
    });
    expect(invite.status).toBe("pending");
    const result = await checkEmailAccess("expired@example.com");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("expired_invite");
    await revokeInvite(invite.id);
  });

  it("allows bootstrap owner when org is empty", async () => {
    process.env.INITIAL_OWNER_EMAIL = "bootstrap@company.com";
    vi.resetModules();
    const { checkEmailAccess } = await import("@/lib/auth/invite-gate");
    const result = await checkEmailAccess("bootstrap@company.com");
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("bootstrap_owner");
    expect(result.role).toBe("owner");
  });

  it("accepts BOOTSTRAP_OWNER_EMAIL alias", async () => {
    process.env.BOOTSTRAP_OWNER_EMAIL = "legacy@company.com";
    vi.resetModules();
    const { checkEmailAccess } = await import("@/lib/auth/invite-gate");
    const result = await checkEmailAccess("legacy@company.com");
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("bootstrap_owner");
  });
});
