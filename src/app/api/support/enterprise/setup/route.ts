import { NextResponse } from "next/server";
import { requireSupportApi, SupportApiPermission } from "@/lib/auth/support-api-auth";
import { buildSetupChecklist, checklistProgress } from "@/lib/support/enterprise/setup-checklist";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.read, req);
  if (auth instanceof NextResponse) return auth;

  const items = await buildSetupChecklist();
  return NextResponse.json({ items, progress: checklistProgress(items) });
}
