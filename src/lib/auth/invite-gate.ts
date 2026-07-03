import "server-only";

import { initialOwnerEmail, isInitialOwnerEmail } from "@/lib/auth/auth-config-public";
import { normalizeEmail } from "@/lib/auth/email-utils";
import {
  getPendingInviteByEmail,
  isValidPendingInvite,
  type StoredInvite,
} from "@/lib/auth/invite-store";
import type { InviteCheckReason } from "@/lib/auth/access-denied";
import { defaultOrgId } from "@/lib/auth/config";
import { getUserByEmail, listUsers } from "@/lib/auth/user-store";

export interface InviteCheckResult {
  allowed: boolean;
  reason: InviteCheckReason;
  role?: string;
  invite?: StoredInvite;
}

function bootstrapOwnerEmail(): string | null {
  const raw = initialOwnerEmail();
  return raw ? normalizeEmail(raw) : null;
}

export { isInitialOwnerEmail };

/** Check whether an email may access the app (active user or valid pending invite). */
export async function checkEmailAccess(
  email: string,
  orgId = defaultOrgId()
): Promise<InviteCheckResult> {
  const normalized = normalizeEmail(email);
  const existing = await getUserByEmail(normalized, orgId);
  const pendingInvite = await getPendingInviteByEmail(normalized, orgId);

  const bootstrap = bootstrapOwnerEmail();
  if (bootstrap && normalized === bootstrap) {
    const users = await listUsers(orgId);
    if (users.length === 0) {
      return { allowed: true, reason: "bootstrap_owner", role: "owner" };
    }
  }

  // Valid pending invite wins over disabled/active history — supports revoke + re-invite.
  if (pendingInvite && isValidPendingInvite(pendingInvite)) {
    return {
      allowed: true,
      reason: "valid_invite",
      role: pendingInvite.role,
      invite: pendingInvite,
    };
  }

  if (existing) {
    if (existing.status === "disabled") {
      return { allowed: false, reason: "disabled" };
    }
    if (existing.status === "active") {
      return { allowed: true, reason: "active_user", role: existing.role };
    }
  }

  if (pendingInvite?.status === "pending") {
    return { allowed: false, reason: "expired_invite" };
  }

  return { allowed: false, reason: "not_invited" };
}
