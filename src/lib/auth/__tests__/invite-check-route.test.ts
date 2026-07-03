import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("invite-check route", () => {
  const originalSecret = process.env.AUTH0_ACTION_SHARED_SECRET;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "invite-check-route-"));
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    process.env.AUTH0_ACTION_SHARED_SECRET = "test-secret-at-least-32-characters-long";
    delete process.env.INITIAL_OWNER_EMAIL;
    delete process.env.BOOTSTRAP_OWNER_EMAIL;
  });

  afterEach(async () => {
    process.env.AUTH0_ACTION_SHARED_SECRET = originalSecret;
    vi.restoreAllMocks();
    vi.resetModules();
    await rm(tmpDir, { recursive: true, force: true });
  });

  function authedRequest(body: object, headers: Record<string, string> = {}) {
    return new Request("http://localhost/api/auth/invite-check", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-secret-at-least-32-characters-long",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  }

  it("rejects missing Authorization header with JSON 401", async () => {
    const { POST } = await import("@/app/api/auth/invite-check/route");
    const res = await POST(
      new Request("http://localhost/api/auth/invite-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      })
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns auth_configuration_error when server secret is unset", async () => {
    delete process.env.AUTH0_ACTION_SHARED_SECRET;
    vi.resetModules();
    const { POST } = await import("@/app/api/auth/invite-check/route");
    const res = await POST(authedRequest({ email: "test@example.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      allowed: false,
      reason: "auth_configuration_error",
    });
  });

  it("accepts x-auth0-action-secret header", async () => {
    process.env.INITIAL_OWNER_EMAIL = "owner@company.com";
    vi.resetModules();
    const { POST } = await import("@/app/api/auth/invite-check/route");
    const res = await POST(
      new Request("http://localhost/api/auth/invite-check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-auth0-action-secret": "test-secret-at-least-32-characters-long",
        },
        body: JSON.stringify({ email: "owner@company.com" }),
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      allowed: true,
      reason: "bootstrap_owner",
      role: "owner",
    });
  });

  it("returns not_invited for unknown email", async () => {
    const { POST } = await import("@/app/api/auth/invite-check/route");
    const res = await POST(authedRequest({ email: "unknown@example.com" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { allowed: boolean; reason: string };
    expect(data.allowed).toBe(false);
    expect(data.reason).toBe("not_invited");
  });

  it("returns auth_configuration_error when checkEmailAccess throws", async () => {
    vi.doMock("@/lib/auth/invite-gate", () => ({
      checkEmailAccess: vi.fn().mockRejectedValue(new Error("DB unavailable")),
    }));
    vi.resetModules();
    const { POST } = await import("@/app/api/auth/invite-check/route");
    const res = await POST(authedRequest({ email: "other@company.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      allowed: false,
      reason: "auth_configuration_error",
    });
    vi.doUnmock("@/lib/auth/invite-gate");
  });

  it("allows bootstrap owner when checkEmailAccess throws", async () => {
    process.env.INITIAL_OWNER_EMAIL = "owner@company.com";
    vi.doMock("@/lib/auth/invite-gate", () => ({
      checkEmailAccess: vi.fn().mockRejectedValue(new Error("DB unavailable")),
    }));
    vi.resetModules();
    const { POST } = await import("@/app/api/auth/invite-check/route");
    const res = await POST(authedRequest({ email: "owner@company.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      allowed: true,
      reason: "bootstrap_owner",
      role: "owner",
    });
    vi.doUnmock("@/lib/auth/invite-gate");
  });
});
