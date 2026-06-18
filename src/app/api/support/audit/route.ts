import { NextResponse } from "next/server";
import { readAudit } from "@/lib/support/audit";

export const runtime = "nodejs";

/** Recent agent actions (audit log). */
export async function GET() {
  const entries = await readAudit(100);
  return NextResponse.json({ entries });
}
