import { NextResponse } from "next/server";

import { getAppSession, sessionToJson } from "@/lib/auth/session";
import { permissionsForRole } from "@/lib/auth/roles";
import { isAuthConfigured } from "@/lib/auth/config";

export const runtime = "nodejs";

/** Current user session + RBAC permissions for the client AuthProvider. */
export async function GET() {
  const session = await getAppSession();
  if (!session) {
    return NextResponse.json({
      authenticated: false,
      authProvider: "none",
      authConfigured: isAuthConfigured(),
      user: null,
      permissions: [],
    });
  }
  return NextResponse.json({
    ...sessionToJson(session),
    authConfigured: isAuthConfigured(),
    permissions: [...permissionsForRole(session.user.role)],
  });
}
