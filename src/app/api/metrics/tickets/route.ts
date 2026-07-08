import { type NextRequest, NextResponse } from "next/server";

import { resolveMetricsAccess } from "@/metrics/metrics-auth";
import { getTicketMetrics } from "@/metrics/MetricsDashboardService";
import type { MetricsDateRange } from "@/metrics/MetricsTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const access = await resolveMetricsAccess(request);
  if (access instanceof NextResponse) return access;

  const sp = request.nextUrl.searchParams;
  const data = await getTicketMetrics({
    range: (sp.get("range") as MetricsDateRange | null) ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
  });
  return NextResponse.json(data);
}
