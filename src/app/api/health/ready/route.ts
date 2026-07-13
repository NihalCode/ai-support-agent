import { NextResponse } from "next/server";

import { isAuthConfigured } from "@/lib/auth/config";
import { isPostgresConfigured } from "@/lib/db/postgres";

export const runtime = "nodejs";

export function GET() {
  const csrfSecret =
    process.env.CSRF_SIGNING_SECRET?.trim() ||
    process.env.AUTH0_SECRET?.trim() ||
    "";
  const checks = {
    auth: isAuthConfigured(),
    csrfSigningSecret: csrfSecret.length >= 32,
    durableDatabase: isPostgresConfigured(),
  };
  const productionReady =
    process.env.NODE_ENV !== "production" ||
    Object.values(checks).every(Boolean);
  return NextResponse.json(
    {
      status: productionReady ? "ready" : "not_ready",
    },
    {
      status: productionReady ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}
