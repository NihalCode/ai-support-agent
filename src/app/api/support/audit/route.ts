import { NextResponse } from "next/server";
import { requireSupportApi, SupportApiPermission } from "@/lib/auth/support-api-auth";
import { readAudit } from "@/lib/support/audit";

export const runtime = "nodejs";

/** Recent agent actions (audit log). */
export async function GET(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.audit, req);
  if (auth instanceof NextResponse) return auth;

  const entries = await readAudit(100);
  return NextResponse.json({ entries });
}
