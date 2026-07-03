/**
 * Pure logic mirrored by Auth0 Post-Login Actions (docs/auth0-post-login-invite-action.js).
 * Auth0 Actions run in their sandbox — keep this module in sync when changing deny codes.
 *
 * Each Action uses the same secret names (APP_BASE_URL, AUTH0_CLIENT_ID, AUTH0_ACTION_SHARED_SECRET)
 * with values scoped to that Auth0 Application.
 */

export interface ActionSecrets {
  APP_BASE_URL?: string;
  AUTH0_CLIENT_ID?: string;
  AUTH0_ACTION_SHARED_SECRET?: string;
}

export interface InviteCheckBody {
  allowed?: boolean;
  reason?: string;
  role?: string;
}

export type ActionDenyCode =
  | "invite_required"
  | "access_disabled"
  | "invite_expired"
  | "auth_configuration_error";

export interface ActionDenyDecision {
  deny: true;
  code: ActionDenyCode;
  message: string;
}

export interface ActionAllowDecision {
  deny: false;
}

export type ActionDecision = ActionDenyDecision | ActionAllowDecision;

export function resolveAppBaseUrl(secrets: ActionSecrets): string | null {
  return secrets.APP_BASE_URL?.trim() || null;
}

/** Skip when Action secret AUTH0_CLIENT_ID is set and does not match the logging-in application. */
export function shouldSkipActionForClient(
  clientId: string | undefined,
  secrets: ActionSecrets
): boolean {
  const expected = secrets.AUTH0_CLIENT_ID?.trim();
  if (!expected) return false;
  return Boolean(clientId && clientId !== expected);
}

export function mapInviteCheckResponse(
  responseOk: boolean,
  body: InviteCheckBody | null,
  configErrorMessage = "Sign-in could not verify workspace access. Contact an administrator."
): ActionDecision {
  if (!responseOk || !body) {
    return {
      deny: true,
      code: "auth_configuration_error",
      message: configErrorMessage,
    };
  }

  if (body.allowed) {
    return { deny: false };
  }

  if (body.reason === "auth_configuration_error") {
    return {
      deny: true,
      code: "auth_configuration_error",
      message: configErrorMessage,
    };
  }

  if (body.reason === "disabled") {
    return {
      deny: true,
      code: "access_disabled",
      message: "Your access has been disabled. Contact your administrator.",
    };
  }

  if (body.reason === "expired_invite") {
    return {
      deny: true,
      code: "invite_expired",
      message: "Ask an administrator to send a new invite.",
    };
  }

  return {
    deny: true,
    code: "invite_required",
    message: "You must be invited to access this app.",
  };
}
