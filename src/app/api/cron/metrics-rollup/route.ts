import { NextRequest, NextResponse } from "next/server";

import { verifyCronSecret } from "@/lib/cron/verify-cron-secret";
import { recomputeRollups } from "@/metrics/MetricsAggregator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Scheduled daily metrics rollup — protected by CRON_SECRET. */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await recomputeRollups();
  return NextResponse.json({ ok: true, ...result });
}
