import { NextRequest, NextResponse } from "next/server";

import { requirePermission } from "@/lib/auth/session";
import { validateAuthConfig } from "@/lib/auth/validate-auth-config";
import { listUsers, userStoreBackend } from "@/lib/auth/user-store";
import { defaultOrgId } from "@/lib/auth/config";
import { isPostgresConfigured } from "@/lib/db/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin-only safe auth configuration diagnostics (no secrets). */
export async function GET(request: NextRequest) {
  const session = await requirePermission("users:write", request);
  if (session instanceof NextResponse) return session;

  const config = validateAuthConfig();
  let activeUserCount: number | null = null;
  let databaseReachable = false;

  try {
    const users = await listUsers(defaultOrgId());
    activeUserCount = users.filter((u) => u.status === "active").length;
    databaseReachable = true;
  } catch {
    databaseReachable = false;
  }

  return NextResponse.json({
    ok: config.ok && databaseReachable,
    config,
    runtime: {
      databaseBackend: userStoreBackend(),
      postgresConfigured: isPostgresConfigured(),
      databaseReachable,
      activeUserCount,
      vercel: Boolean(process.env.VERCEL),
    },
  });
}
