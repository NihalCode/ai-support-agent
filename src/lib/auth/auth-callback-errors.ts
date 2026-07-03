import {
  AuthorizationCodeGrantError,
  AuthorizationError,
  InvalidConfigurationError,
  InvalidStateError,
  MissingStateError,
  OAuth2Error,
} from "@auth0/nextjs-auth0/errors";

export interface AuthCallbackFailure {
  code: string;
  message: string;
}

function hasCause(error: unknown): error is { cause?: unknown } {
  return typeof error === "object" && error !== null && "cause" in error;
}

function unwrapOAuth2(error: unknown): OAuth2Error | null {
  if (error instanceof OAuth2Error) return error;
  if (hasCause(error) && error.cause) {
    return unwrapOAuth2(error.cause);
  }
  return null;
}

function inviteDeniedMessage(code = "invite_required"): AuthCallbackFailure {
  return {
    code,
    message:
      code === "expired_invite"
        ? "Your invite has expired. Ask an administrator to send a new invite before signing in."
        : "This workspace is invite-only. Ask an administrator to invite your email before signing in.",
  };
}

function disabledMessage(): AuthCallbackFailure {
  return {
    code: "access_disabled",
    message: "Your account has been disabled. Contact your workspace administrator for access.",
  };
}

function authConfigMessage(): AuthCallbackFailure {
  return {
    code: "auth_configuration_error",
    message:
      "Sign-in could not verify workspace access. Ask an administrator to confirm AUTH0_ACTION_SHARED_SECRET and APP_BASE_URL match in Vercel and the Auth0 Post-Login Action secrets.",
  };
}

/** Map Auth0 SDK callback errors to login page codes and plain-English copy. */
export function mapAuthCallbackError(error: unknown): AuthCallbackFailure {
  if (error instanceof InvalidStateError || error instanceof MissingStateError) {
    return {
      code: "invalid_state",
      message:
        "Sign-in could not be verified. Click a sign-in option below and complete login in this same tab.",
    };
  }

  if (error instanceof InvalidConfigurationError) {
    return authConfigMessage();
  }

  if (error instanceof AuthorizationCodeGrantError) {
    return {
      code: "auth_failed",
      message:
        "Auth0 rejected the login code. Confirm callback URLs and client credentials match this site, then try again.",
    };
  }

  const oauth = unwrapOAuth2(error);
  if (oauth) {
    const code = oauth.code?.toLowerCase() ?? "";
    const message = (oauth.message ?? "").toLowerCase();

    if (
      code === "auth_configuration_error" ||
      code === "invite_check_failed" ||
      message.includes("auth_configuration_error") ||
      message.includes("invite_check_failed") ||
      message.includes("access control is not configured")
    ) {
      return authConfigMessage();
    }

    if (
      code === "invite_required" ||
      code === "not_invited" ||
      (code === "access_denied" &&
        (message.includes("must be invited") || message.includes("invite_required")))
    ) {
      return inviteDeniedMessage();
    }

    if (code === "expired_invite" || code === "invite_expired" || message.includes("expired_invite")) {
      return inviteDeniedMessage("expired_invite");
    }

    if (
      code === "access_disabled" ||
      code === "disabled" ||
      message.includes("access_disabled") ||
      message.includes("account has been disabled")
    ) {
      return disabledMessage();
    }

    if (code === "wrong_email" || message.includes("wrong email")) {
      return {
        code: "wrong_invite_email",
        message:
          "You signed in with a different email than the one that was invited. Use the invited email address.",
      };
    }

    if (code === "access_denied") {
      return {
        code: "auth_denied",
        message: "Sign-in was cancelled or denied.",
      };
    }

    if (message === "an error occurred during the authorization flow.") {
      return authConfigMessage();
    }

    return {
      code: "auth_failed",
      message:
        "Sign-in could not be completed. Use one browser tab, clear stale cookies for this site, and try again.",
    };
  }

  if (error instanceof AuthorizationError) {
    const text = `${error.message ?? ""}`.toLowerCase();
    if (text.includes("auth_configuration_error") || text.includes("invite_check_failed")) {
      return authConfigMessage();
    }
    if (text.includes("must be invited") || text.includes("invite_required")) {
      return inviteDeniedMessage();
    }
    if (text.includes("expired_invite") || text.includes("invite_expired")) {
      return inviteDeniedMessage("expired_invite");
    }
    if (text.includes("access_disabled") || text.includes("disabled")) {
      return disabledMessage();
    }
    if (text === "an error occurred during the authorization flow.") {
      return authConfigMessage();
    }
    return {
      code: "auth_failed",
      message:
        "Sign-in could not be completed. Use one browser tab, clear stale cookies for this site, and try again.",
    };
  }

  if (error instanceof Error && error.message.trim()) {
    const text = error.message.toLowerCase();
    if (text.includes("auth_configuration_error") || text.includes("invite_check_failed")) {
      return authConfigMessage();
    }
    if (text.includes("must be invited") || text.includes("invite_required")) {
      return inviteDeniedMessage();
    }
    if (text === "an error occurred during the authorization flow.") {
      return authConfigMessage();
    }
    return { code: "auth_failed", message: error.message };
  }

  return {
    code: "auth_failed",
    message: "Sign-in could not be completed. Please try again.",
  };
}
