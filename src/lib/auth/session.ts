import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isAuthEnabled } from "@/lib/auth/config";
import type { Permission, UserRole } from "@/lib/auth/roles";
import { roleHasPermission } from "@/lib/auth/roles";
import { upsertUserFromLogin } from "@/lib/auth/user-store";
import { auth0 } from "@/lib/auth0";
import { isTestMode } from "@/lib/test-mode";

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

export async function getAppSession(request?: NextRequest): Promise<AppSession | null> {
  if (!isAuthEnabled()) {
    return mockSession(request);
  }

  if (!auth0) return null;

  const authSession = request
    ? await auth0.getSession(request)
    : await auth0.getSession();

  const authUser = authSession?.user;
  if (!authUser?.sub || !authUser.email) return null;

  const stored = await upsertUserFromLogin({
    id: authUser.sub,
    email: authUser.email,
    name: authUser.name ?? authUser.nickname ?? null,
  });

  if (stored.status === "disabled") return null;

  return {
    authProvider: "auth0",
    user: {
      id: stored.id,
      email: stored.email,
      name: stored.name,
      role: stored.role,
      orgId: stored.orgId,
      status: stored.status,
      picture: authUser.picture ?? null,
    },
  };
}

export async function requireSession(
  request?: NextRequest
): Promise<AppSession | NextResponse> {
  const session = await getAppSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
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
