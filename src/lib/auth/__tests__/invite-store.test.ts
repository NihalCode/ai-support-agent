import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("invite-store", () => {
  const originalCwd = process.cwd();
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "invite-store-"));
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("creates pending invite with hashed token", async () => {
    const { createInvite, getInviteByRawToken } = await import("@/lib/auth/invite-store");
    const { rawToken, invite } = await createInvite({
      email: "Invited@Example.com",
      role: "support_agent",
      invitedByUserId: "admin-1",
    });
    expect(invite.email).toBe("invited@example.com");
    expect(invite.status).toBe("pending");
    const loaded = await getInviteByRawToken(rawToken);
    expect(loaded?.id).toBe(invite.id);
  });

  it("revokes pending invite", async () => {
    const { createInvite, revokeInvite, listInvites } = await import("@/lib/auth/invite-store");
    const { invite } = await createInvite({
      email: "revoke@example.com",
      role: "viewer",
      invitedByUserId: "admin-1",
    });
    const revoked = await revokeInvite(invite.id);
    expect(revoked?.status).toBe("revoked");
    const all = await listInvites();
    expect(all.find((i) => i.id === invite.id)?.status).toBe("revoked");
  });

  it("accepts invite", async () => {
    const { createInvite, acceptInvite } = await import("@/lib/auth/invite-store");
    const { invite } = await createInvite({
      email: "accept@example.com",
      role: "developer",
      invitedByUserId: "admin-1",
    });
    const accepted = await acceptInvite(invite.id);
    expect(accepted?.status).toBe("accepted");
    expect(accepted?.acceptedAt).toBeTruthy();
  });
});
