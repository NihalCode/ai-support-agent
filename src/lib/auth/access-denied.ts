export type AccessDeniedReason =
  | "invite_required"
  | "disabled"
  | "expired_invite"
  | "revoked_invite"
  | "wrong_invite_email"
  | "not_invited";

export class AccessDeniedError extends Error {
  readonly reason: AccessDeniedReason;
  readonly invitedEmail?: string;

  constructor(reason: AccessDeniedReason, invitedEmail?: string) {
    super(reason);
    this.name = "AccessDeniedError";
    this.reason = reason;
    this.invitedEmail = invitedEmail;
  }
}

export type InviteCheckReason =
  | "active_user"
  | "valid_invite"
  | "not_invited"
  | "disabled"
  | "expired_invite";

export function accessDeniedToCheckReason(
  reason: AccessDeniedReason
): InviteCheckReason {
  switch (reason) {
    case "disabled":
      return "disabled";
    case "expired_invite":
      return "expired_invite";
    default:
      return "not_invited";
  }
}
