import { describe, expect, it } from "vitest";

import {
  mapInviteCheckResponse,
  resolveAppBaseUrl,
  shouldSkipActionForClient,
} from "@/lib/auth/auth0-invite-action-logic";

describe("auth0 invite action logic", () => {
  it("resolves APP_BASE_URL", () => {
    expect(
      resolveAppBaseUrl({ APP_BASE_URL: "https://support.example.com" })
    ).toBe("https://support.example.com");
  });

  it("returns null when APP_BASE_URL is unset", () => {
    expect(resolveAppBaseUrl({})).toBeNull();
  });

  it("skips action when client id does not match AUTH0_CLIENT_ID secret", () => {
    expect(
      shouldSkipActionForClient("client-a", { AUTH0_CLIENT_ID: "client-b" })
    ).toBe(true);
    expect(
      shouldSkipActionForClient("client-a", { AUTH0_CLIENT_ID: "client-a" })
    ).toBe(false);
  });

  it("does not skip when AUTH0_CLIENT_ID secret is unset", () => {
    expect(shouldSkipActionForClient("any-client", {})).toBe(false);
  });

  it("maps auth_configuration_error from failed HTTP", () => {
    const decision = mapInviteCheckResponse(false, null);
    expect(decision.deny).toBe(true);
    if (decision.deny) {
      expect(decision.code).toBe("auth_configuration_error");
    }
  });

  it("maps auth_configuration_error reason from invite-check body", () => {
    const decision = mapInviteCheckResponse(true, {
      allowed: false,
      reason: "auth_configuration_error",
    });
    expect(decision).toEqual({
      deny: true,
      code: "auth_configuration_error",
      message: expect.any(String),
    });
  });

  it("maps disabled and expired invite reasons", () => {
    const disabled = mapInviteCheckResponse(true, { allowed: false, reason: "disabled" });
    expect(disabled.deny).toBe(true);
    if (disabled.deny) expect(disabled.code).toBe("access_disabled");
    const expired = mapInviteCheckResponse(true, { allowed: false, reason: "expired_invite" });
    expect(expired.deny).toBe(true);
    if (expired.deny) expect(expired.code).toBe("invite_expired");
  });

  it("allows when body.allowed is true", () => {
    expect(mapInviteCheckResponse(true, { allowed: true, reason: "active_user" })).toEqual({
      deny: false,
    });
  });
});
