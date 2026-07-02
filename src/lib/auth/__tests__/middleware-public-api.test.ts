import { describe, expect, it } from "vitest";

/** Mirrors middleware public API rules — keep in sync with src/middleware.ts */
function isPublicApiPath(pathname: string): boolean {
  const PUBLIC_API_PREFIXES = [
    "/api/slack/",
    "/api/integrations/slack/events",
  ];
  const PUBLIC_API_EXACT = [
    "/api/auth/me",
    "/api/auth/invite-check",
    "/api/auth/invites/validate",
  ];
  if (PUBLIC_API_EXACT.includes(pathname)) return true;
  return PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

describe("middleware public API paths", () => {
  it("allows auth bootstrap without session", () => {
    expect(isPublicApiPath("/api/auth/me")).toBe(true);
  });

  it("allows Slack webhooks without session", () => {
    expect(isPublicApiPath("/api/slack/events")).toBe(true);
    expect(isPublicApiPath("/api/slack/interactions")).toBe(true);
    expect(isPublicApiPath("/api/integrations/slack/events")).toBe(true);
  });

  it("allows invite-check and validate without session", () => {
    expect(isPublicApiPath("/api/auth/invite-check")).toBe(true);
    expect(isPublicApiPath("/api/auth/invites/validate")).toBe(true);
  });

  it("protects support and integration APIs", () => {
    expect(isPublicApiPath("/api/support/health")).toBe(false);
    expect(isPublicApiPath("/api/integrations")).toBe(false);
    expect(isPublicApiPath("/api/auth/users")).toBe(false);
  });
});
