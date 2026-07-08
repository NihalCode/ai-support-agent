import { type NextRequest, NextResponse } from "next/server";

import { resolveMetricsAccess } from "@/metrics/metrics-auth";
import { getMetricsSummary } from "@/metrics/MetricsDashboardService";
import type { MetricsDateRange, MetricsQueryFilters } from "@/metrics/MetricsTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseFilters(request: NextRequest): MetricsQueryFilters {
  const sp = request.nextUrl.searchParams;
  return {
    range: (sp.get("range") as MetricsDateRange | null) ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
  };
}

export async function GET(request: NextRequest) {
  const access = await resolveMetricsAccess(request);
  if (access instanceof NextResponse) return access;

  const data = await getMetricsSummary(parseFilters(request));
  return NextResponse.json(data);
}
