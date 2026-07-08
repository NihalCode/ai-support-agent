import { type NextRequest, NextResponse } from "next/server";

import { requirePermission } from "@/lib/auth/session";
import { recomputeRollups } from "@/metrics/MetricsAggregator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await requirePermission("metrics:write", request);
  if (session instanceof NextResponse) return session;

  let body: { from?: string; to?: string } = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await recomputeRollups(body);
  return NextResponse.json({ ok: true, ...result });
}
