import { NextResponse } from "next/server";
import { requireSupportApi, SupportApiPermission } from "@/lib/auth/support-api-auth";
import { ensureAutoImported } from "@/lib/support/bootstrap/auto-import";
import { getApiRegistry } from "@/apiRegistry/apiRegistry";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Auto-import bundled Cyware specs + CQL docs. Safe to call on every app load. */
export async function GET(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.read, req);
  if (auth instanceof NextResponse) return auth;

  const result = await ensureAutoImported();
  const registry = getApiRegistry().summary();
  return NextResponse.json({ ...result, registry });
}

export async function POST(req: Request) {
  return GET(req);
}
