import { NextResponse } from "next/server";

import { getAppSessionResult, sessionToJson } from "@/lib/auth/session";
import { permissionsForRole } from "@/lib/auth/roles";
import { isAuthConfigured } from "@/lib/auth/config";

export const runtime = "nodejs";

/** Current user session + RBAC permissions for the client AuthProvider. */
export async function GET() {
  const result = await getAppSessionResult();
  if (!result.session) {
    return NextResponse.json({
      authenticated: false,
      authProvider: "none",
      authConfigured: isAuthConfigured(),
      auth0Authenticated: Boolean(result.auth0Authenticated),
      accessDenied: result.accessDenied ?? null,
      user: null,
      permissions: [],
    });
  }
  return NextResponse.json({
    ...sessionToJson(result.session),
    authConfigured: isAuthConfigured(),
    auth0Authenticated: true,
    accessDenied: null,
    permissions: [...permissionsForRole(result.session.user.role)],
  });
}
