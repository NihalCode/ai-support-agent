import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("invite-check route", () => {
  const originalSecret = process.env.AUTH0_ACTION_SHARED_SECRET;

  beforeEach(() => {
    process.env.AUTH0_ACTION_SHARED_SECRET = "test-secret-at-least-32-characters-long";
  });

  afterEach(() => {
    process.env.AUTH0_ACTION_SHARED_SECRET = originalSecret;
    vi.resetModules();
  });

  it("rejects missing secret", async () => {
    const { POST } = await import("@/app/api/auth/invite-check/route");
    const res = await POST(
      new Request("http://localhost/api/auth/invite-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns not_invited for unknown email", async () => {
    const { POST } = await import("@/app/api/auth/invite-check/route");
    const res = await POST(
      new Request("http://localhost/api/auth/invite-check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-secret-at-least-32-characters-long",
        },
        body: JSON.stringify({ email: "unknown@example.com" }),
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { allowed: boolean; reason: string };
    expect(data.allowed).toBe(false);
    expect(data.reason).toBe("not_invited");
  });
});
