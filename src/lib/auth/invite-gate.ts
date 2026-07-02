import "server-only";

import { cleanEnvValue } from "@/lib/auth/env";
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
  const raw = cleanEnvValue(process.env.BOOTSTRAP_OWNER_EMAIL);
  return raw ? normalizeEmail(raw) : null;
}

/** Check whether an email may access the app (active user or valid pending invite). */
export async function checkEmailAccess(
  email: string,
  orgId = defaultOrgId()
): Promise<InviteCheckResult> {
  const normalized = normalizeEmail(email);
  const existing = await getUserByEmail(normalized, orgId);

  if (existing) {
    if (existing.status === "disabled") {
      return { allowed: false, reason: "disabled" };
    }
    if (existing.status === "active") {
      return { allowed: true, reason: "active_user", role: existing.role };
    }
  }

  const invite = await getPendingInviteByEmail(normalized, orgId);
  if (invite) {
    if (invite.status === "pending" && isValidPendingInvite(invite)) {
      return {
        allowed: true,
        reason: "valid_invite",
        role: invite.role,
        invite,
      };
    }
    if (invite.status === "pending") {
      return { allowed: false, reason: "expired_invite" };
    }
  }

  const bootstrap = bootstrapOwnerEmail();
  if (bootstrap && normalized === bootstrap) {
    const users = await listUsers(orgId);
    if (users.length === 0) {
      return { allowed: true, reason: "valid_invite", role: "owner" };
    }
  }

  return { allowed: false, reason: "not_invited" };
}
