import { type NextRequest, NextResponse } from "next/server";

import { requirePermission } from "@/lib/auth/session";
import { saveMetricsSettings, getMetricsSettings } from "@/metrics/stores/metrics-store";
import type { TaskBaselines } from "@/metrics/MetricsTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await requirePermission("metrics:write", request);
  if (session instanceof NextResponse) return session;

  const settings = await getMetricsSettings();
  return NextResponse.json({ settings });
}

interface SettingsBody {
  enabled?: boolean;
  retentionDays?: number;
  taskBaselines?: TaskBaselines;
  allowDeveloperView?: boolean;
  allowSupportAgentView?: boolean;
}

export async function POST(request: NextRequest) {
  const session = await requirePermission("metrics:write", request);
  if (session instanceof NextResponse) return session;

  let body: SettingsBody;
  try {
    body = (await request.json()) as SettingsBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const settings = await saveMetricsSettings(body, session.user.id);
  return NextResponse.json({ settings });
}
