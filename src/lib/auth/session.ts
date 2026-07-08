import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { AccessDeniedError, type AccessDeniedReason } from "@/lib/auth/access-denied";
import { logAuthEvent } from "@/lib/auth/auth-audit";
import { isAuthEnabled, defaultOrgId } from "@/lib/auth/config";
import { normalizeEmail, emailDomain } from "@/lib/auth/email-utils";
import { checkEmailAccess } from "@/lib/auth/invite-gate";
import { acceptInvite, getPendingInviteByEmail, isValidPendingInvite } from "@/lib/auth/invite-store";
import type { Permission, UserRole } from "@/lib/auth/roles";
import { roleHasPermission } from "@/lib/auth/roles";
import {
  applyInviteToExistingUser,
  createUserFromInvite,
  getUserByEmail,
  getUserById,
  relinkUserAuthSubject,
  upsertUserFromLogin,
  type StoredUser,
} from "@/lib/auth/user-store";
import { auth0 } from "@/lib/auth0";
import { isTestMode } from "@/lib/test-mode";
import { metrics } from "@/metrics/MetricsService";

export interface AppSessionUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  orgId: string;
  status: "active" | "disabled";
  picture?: string | null;
}

export interface AppSession {
  user: AppSessionUser;
  authProvider: "auth0" | "test" | "disabled";
}

export interface AppSessionResult {
  session: AppSession | null;
  accessDenied?: {
    reason: AccessDeniedReason;
    invitedEmail?: string;
  };
  auth0Authenticated?: boolean;
}

function testRoleFromRequest(request?: NextRequest): UserRole {
  const header = request?.headers.get("x-test-role")?.trim();
  if (
    header === "owner" ||
    header === "admin" ||
    header === "developer" ||
    header === "support_agent" ||
    header === "viewer"
  ) {
    return header;
  }
  return "owner";
}

function mockSession(request?: NextRequest): AppSession {
  const role = testRoleFromRequest(request);
  return {
    authProvider: isTestMode() ? "test" : "disabled",
    user: {
      id: isTestMode() ? `test-user-${role}` : "local-dev-user",
      email: isTestMode() ? `${role}@test.local` : "dev@localhost",
      name: isTestMode() ? `Test ${role}` : "Local Developer",
      role,
      orgId: "default",
      status: "active",
    },
  };
}

async function resolveAuth0User(request?: NextRequest) {
  if (!auth0) return null;
  const authSession = request
    ? await auth0.getSession(request)
    : await auth0.getSession();
  const authUser = authSession?.user;
  if (!authUser?.sub || !authUser.email) return null;
  return {
    sub: authUser.sub,
    email: normalizeEmail(authUser.email),
    name: authUser.name ?? authUser.nickname ?? null,
    picture: authUser.picture ?? null,
  };
}

function toAppSession(stored: {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  orgId: string;
  status: "active" | "disabled";
  picture?: string | null;
}): AppSession {
  return {
    authProvider: "auth0",
    user: {
      id: stored.id,
      email: stored.email,
      name: stored.name,
      role: stored.role,
      orgId: stored.orgId,
      status: stored.status,
      picture: stored.picture ?? null,
    },
  };
}

async function applyPendingInviteIfAny(
  user: StoredUser,
  email: string,
  orgId: string
): Promise<StoredUser> {
  const pendingInvite = await getPendingInviteByEmail(email, orgId);
  if (!pendingInvite || !isValidPendingInvite(pendingInvite)) {
    return user;
  }

  const upgraded = await applyInviteToExistingUser({
    id: user.id,
    role: pendingInvite.role,
    invitedByUserId: pendingInvite.invitedByUserId,
    orgId,
  });
  if (!upgraded) {
    return user;
  }

  await acceptInvite(pendingInvite.id, orgId);
  await logAuthEvent({
    action: "auth.invite_accepted",
    actorUserId: upgraded.id,
    actorEmail: upgraded.email,
    targetId: pendingInvite.id,
    metadata: { role: upgraded.role, reinvite: true },
  });
  return upgraded;
}

/** Resolve app session with invite-only enforcement. */
export async function getAppSessionResult(
  request?: NextRequest
): Promise<AppSessionResult> {
  if (!isAuthEnabled()) {
    return { session: mockSession(request) };
  }

  if (!auth0) {
    return { session: null };
  }

  const authUser = await resolveAuth0User(request);
  if (!authUser) {
    return { session: null, auth0Authenticated: false };
  }

  const orgId = defaultOrgId();
  const existingById = await getUserById(authUser.sub);
  const existingByEmail = await getUserByEmail(authUser.email, orgId);

  if (existingById) {
    const pendingInvite = await getPendingInviteByEmail(authUser.email, orgId);

    if (
      existingById.status === "disabled" &&
      (!pendingInvite || !isValidPendingInvite(pendingInvite))
    ) {
      return {
        session: null,
        auth0Authenticated: true,
        accessDenied: { reason: "disabled" },
      };
    }

    let sessionUser = await applyPendingInviteIfAny(existingById, authUser.email, orgId);

    const updated = await upsertUserFromLogin({
      id: authUser.sub,
      email: authUser.email,
      name: authUser.name,
      picture: authUser.picture,
    });
    sessionUser = updated ?? sessionUser;

    if (sessionUser.status === "disabled") {
      return {
        session: null,
        auth0Authenticated: true,
        accessDenied: { reason: "disabled" },
      };
    }

    await logAuthEvent({
      action: "auth.login_success",
      actorUserId: sessionUser.id,
      actorEmail: sessionUser.email,
      metadata: { connection: "auth0" },
    });
    void metrics.track({
      eventType: "auth.login_success",
      category: "auth",
      actorUserId: sessionUser.id,
      actorRole: sessionUser.role,
    });
    return { session: toAppSession(sessionUser), auth0Authenticated: true };
  }

  if (existingByEmail && existingByEmail.id !== authUser.sub) {
    const pendingInvite = await getPendingInviteByEmail(authUser.email, orgId);
    const hasValidReinvite = Boolean(pendingInvite && isValidPendingInvite(pendingInvite));

    if (existingByEmail.status === "disabled" && !hasValidReinvite) {
      return {
        session: null,
        auth0Authenticated: true,
        accessDenied: { reason: "disabled" },
      };
    }

    const relinked = await relinkUserAuthSubject({
      previousId: existingByEmail.id,
      auth0Sub: authUser.sub,
      email: authUser.email,
      name: authUser.name,
      picture: authUser.picture,
      orgId,
    });

    if (!relinked) {
      return {
        session: null,
        auth0Authenticated: true,
        accessDenied: { reason: "invite_required" },
      };
    }

    let sessionUser = await applyPendingInviteIfAny(relinked, authUser.email, orgId);

    await logAuthEvent({
      action: "auth.auth_subject_relinked",
      actorUserId: sessionUser.id,
      actorEmail: sessionUser.email,
      metadata: { previousAuthSubject: existingByEmail.id },
    });
    await logAuthEvent({
      action: "auth.login_success",
      actorUserId: sessionUser.id,
      actorEmail: sessionUser.email,
      metadata: { connection: "auth0", relinked: true },
    });
    return { session: toAppSession(sessionUser), auth0Authenticated: true };
  }

  const access = await checkEmailAccess(authUser.email, orgId);
  if (!access.allowed) {
    const reason: AccessDeniedReason =
      access.reason === "disabled"
        ? "disabled"
        : access.reason === "expired_invite"
          ? "expired_invite"
          : "invite_required";

    await logAuthEvent({
      action: "auth.blocked_uninvited_login",
      actorEmail: authUser.email,
      status: "rejected",
      metadata: {
        emailDomain: emailDomain(authUser.email),
        reason: access.reason,
      },
    });
    void metrics.track({
      eventType: "auth.login_blocked",
      category: "auth",
      success: false,
      metadata: { reason: access.reason },
    });

    return {
      session: null,
      auth0Authenticated: true,
      accessDenied: { reason },
    };
  }

  const role = (access.role ?? "viewer") as UserRole;
  const invitedByUserId: string | null = access.invite?.invitedByUserId ?? null;

  const created = await createUserFromInvite({
    id: authUser.sub,
    email: authUser.email,
    name: authUser.name,
    picture: authUser.picture,
    role,
    invitedByUserId,
    orgId,
  });

  if (access.invite) {
    await acceptInvite(access.invite.id, orgId);
    await logAuthEvent({
      action: "auth.invite_accepted",
      actorUserId: created.id,
      actorEmail: created.email,
      targetId: access.invite.id,
      metadata: { role: created.role },
    });
  } else {
    await logAuthEvent({
      action: "auth.invited_user_first_login",
      actorUserId: created.id,
      actorEmail: created.email,
      metadata: { role: created.role, bootstrap: role === "owner" },
    });
  }

  await logAuthEvent({
    action: "auth.login_success",
    actorUserId: created.id,
    actorEmail: created.email,
    metadata: { firstLogin: true },
  });

  return { session: toAppSession(created), auth0Authenticated: true };
}

export async function getAppSession(request?: NextRequest): Promise<AppSession | null> {
  const result = await getAppSessionResult(request);
  return result.session;
}

export async function requireSession(
  request?: NextRequest
): Promise<AppSession | NextResponse> {
  const result = await getAppSessionResult(request);
  if (result.session) return result.session;

  if (result.accessDenied) {
    return NextResponse.json(
      {
        error: "Access denied",
        reason: result.accessDenied.reason,
        invitedEmail: result.accessDenied.invitedEmail,
      },
      { status: 403 }
    );
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function requirePermission(
  permission: Permission,
  request?: NextRequest
): Promise<AppSession | NextResponse> {
  const sessionOrResponse = await requireSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  if (!roleHasPermission(sessionOrResponse.user.role, permission)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return sessionOrResponse;
}

export function sessionToJson(session: AppSession) {
  return {
    authenticated: session.authProvider === "auth0",
    authProvider: session.authProvider,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      orgId: session.user.orgId,
      status: session.user.status,
      picture: session.user.picture ?? null,
    },
  };
}

export { AccessDeniedError };
