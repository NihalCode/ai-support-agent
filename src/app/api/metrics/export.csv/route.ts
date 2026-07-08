import { type NextRequest, NextResponse } from "next/server";

import { sanitizeExportCell } from "@/metrics/MetricsPrivacy";
import { resolveMetricsAccess } from "@/metrics/metrics-auth";
import { exportMetricsCsv, getMetricsEvents } from "@/metrics/MetricsDashboardService";
import type { MetricsDateRange } from "@/metrics/MetricsTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const access = await resolveMetricsAccess(request);
  if (access instanceof NextResponse) return access;

  if (access.level !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const filters = {
    range: (sp.get("range") as MetricsDateRange | null) ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    limit: 5000,
  };

  const csv = await exportMetricsCsv(filters);
  const { events } = await getMetricsEvents(filters);
  const safeRows = events.map((e) =>
    [
      sanitizeExportCell(e.id),
      sanitizeExportCell(e.createdAt),
      sanitizeExportCell(e.eventType),
      sanitizeExportCell(e.category),
      sanitizeExportCell(e.success),
      sanitizeExportCell(e.durationMs ?? ""),
      sanitizeExportCell(e.actorRole ?? ""),
    ].join(",")
  );
  const safeCsv = ["id,created_at,event_type,category,success,duration_ms,actor_role", ...safeRows].join("\n");

  return new NextResponse(safeCsv || csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="metrics-export.csv"',
    },
  });
}
