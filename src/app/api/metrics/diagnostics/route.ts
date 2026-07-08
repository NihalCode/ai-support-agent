import { type NextRequest, NextResponse } from "next/server";

import { resolveMetricsAccess } from "@/metrics/metrics-auth";
import { runMetricsDiagnostics } from "@/metrics/MetricsDiagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const access = await resolveMetricsAccess(request);
  if (access instanceof NextResponse) return access;

  const diagnostics = await runMetricsDiagnostics();
  return NextResponse.json(diagnostics);
}
