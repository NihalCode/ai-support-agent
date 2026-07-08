import { type NextRequest, NextResponse } from "next/server";

import { resolveMetricsAccess } from "@/metrics/metrics-auth";
import { getMetricsEvents } from "@/metrics/MetricsDashboardService";
import type { MetricsCategory, MetricsDateRange } from "@/metrics/MetricsTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const access = await resolveMetricsAccess(request);
  if (access instanceof NextResponse) return access;

  const sp = request.nextUrl.searchParams;
  const data = await getMetricsEvents({
    range: (sp.get("range") as MetricsDateRange | null) ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    category: (sp.get("category") as MetricsCategory | null) ?? undefined,
    eventType: sp.get("eventType") ?? undefined,
    limit: sp.get("limit") ? Number(sp.get("limit")) : 100,
  });
  return NextResponse.json(data);
}
