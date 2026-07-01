import { NextResponse } from "next/server";
import { requireSupportApi, SupportApiPermission } from "@/lib/auth/support-api-auth";
import { readEnterpriseAudit, enterpriseAuditBackend } from "@/lib/support/enterprise/audit-log";

export const runtime = "nodejs";

/** Unified enterprise audit log with filters. */
export async function GET(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.audit, req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
  const actorUserId = url.searchParams.get("actor") ?? undefined;
  const action = url.searchParams.get("action") ?? undefined;
  const targetSystem = url.searchParams.get("targetSystem") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;

  const entries = await readEnterpriseAudit(limit);
  let filtered = entries;
  if (actorUserId) filtered = filtered.filter((e) => e.actorUserId === actorUserId);
  if (action) filtered = filtered.filter((e) => e.action.includes(action));
  if (targetSystem) filtered = filtered.filter((e) => e.targetSystem === targetSystem);
  if (status) filtered = filtered.filter((e) => e.status === status);

  return NextResponse.json({ backend: enterpriseAuditBackend(), entries: filtered });
}
