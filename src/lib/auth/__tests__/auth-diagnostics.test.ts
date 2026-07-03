import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/config", () => ({
  isAuthEnabled: () => true,
  isAuthConfigured: () => true,
  defaultOrgId: () => "default",
}));

describe("auth-diagnostics API", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 without authenticated session when auth is enabled", async () => {
    const { GET: authDiagnosticsGet } = await import("@/app/api/admin/auth-diagnostics/route");
    const response = await authDiagnosticsGet(
      new Request("http://localhost/api/admin/auth-diagnostics") as import("next/server").NextRequest
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});
