import { describe, expect, it } from "vitest";
import {
  AuthorizationCodeGrantError,
  AuthorizationError,
  InvalidStateError,
  OAuth2Error,
} from "@auth0/nextjs-auth0/errors";

import { mapAuthCallbackError } from "@/lib/auth/auth-callback-errors";

describe("mapAuthCallbackError", () => {
  it("maps invalid state", () => {
    const mapped = mapAuthCallbackError(new InvalidStateError());
    expect(mapped.code).toBe("invalid_state");
  });

  it("maps invite_required from OAuth2 access_denied", () => {
    const mapped = mapAuthCallbackError(
      new OAuth2Error({
        code: "access_denied",
        message: "You must be invited to access this app.",
      })
    );
    expect(mapped.code).toBe("invite_required");
  });

  it("maps auth_configuration_error instead of generic authorization flow message", () => {
    const mapped = mapAuthCallbackError(
      new AuthorizationError({
        cause: new OAuth2Error({ code: "access_denied", message: "auth_configuration_error" }),
      })
    );
    expect(mapped.code).toBe("auth_configuration_error");
    expect(mapped.message).toMatch(/AUTH0_ACTION_SHARED_SECRET/);
  });

  it("maps generic AuthorizationError with server_error cause to auth_failed", () => {
    const mapped = mapAuthCallbackError(
      new AuthorizationError({
        cause: new OAuth2Error({ code: "server_error", message: "upstream" }),
        message: "Sign-in could not be completed.",
      })
    );
    expect(mapped.code).toBe("auth_failed");
    expect(mapped.message).not.toBe("An error occurred during the authorization flow.");
  });

  it("maps bare generic authorization flow message to auth_configuration_error", () => {
    const mapped = mapAuthCallbackError(
      new AuthorizationError({
        cause: new OAuth2Error({ code: "server_error", message: "An error occurred during the authorization flow." }),
        message: "An error occurred during the authorization flow.",
      })
    );
    expect(mapped.code).toBe("auth_configuration_error");
  });

  it("maps access_disabled", () => {
    const mapped = mapAuthCallbackError(
      new OAuth2Error({ code: "access_disabled", message: "disabled" })
    );
    expect(mapped.code).toBe("access_disabled");
  });

  it("maps expired_invite", () => {
    const mapped = mapAuthCallbackError(
      new OAuth2Error({ code: "invite_expired", message: "Invite expired" })
    );
    expect(mapped.code).toBe("expired_invite");
  });

  it("maps authorization code grant failures", () => {
    const mapped = mapAuthCallbackError(
      new AuthorizationCodeGrantError({
        cause: new OAuth2Error({ code: "invalid_grant", message: "invalid grant" }),
      })
    );
    expect(mapped.code).toBe("auth_failed");
    expect(mapped.message).toMatch(/callback URLs/i);
  });
});
