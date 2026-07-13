import { NextResponse } from "next/server";
import { requireSupportApi, SupportApiPermission } from "@/lib/auth/support-api-auth";
import { buildIntegrationHealthCards, summarizeHealthForSupportMode } from "@/lib/support/enterprise/integration-health";
import {
  buildDegradedSummaries,
  sanitizeHealthForSupportMode,
} from "@/lib/support/enterprise/degraded-mode";
import { listSystemHealthEvents, resolveSystemHealthEvent } from "@/lib/support/enterprise/stores/system-health-store";
import { audit } from "@/lib/support/enterprise/audit-log";
import { roleHasPermission } from "@/lib/auth/roles";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.read, req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const developerMode =
    url.searchParams.get("developer") === "true" &&
    roleHasPermission(auth.user.role, "developer:mode");
  const cards = sanitizeHealthForSupportMode(
    await buildIntegrationHealthCards(developerMode, auth.user.orgId)
  );
  const events = await listSystemHealthEvents("open");

  return NextResponse.json({
    integrations: cards,
    supportSummary: summarizeHealthForSupportMode(cards),
    degraded: buildDegradedSummaries(cards, developerMode),
    systemHealth: events,
  });
}

export async function POST(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.approve, req);
  if (auth instanceof NextResponse) return auth;

  let body: { intent: "resolve_health"; id: string };
  try {
    body = (await req.json()) as { intent: "resolve_health"; id: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.intent === "resolve_health") {
    const event = await resolveSystemHealthEvent(body.id);
    if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await audit({
      action: "system-health:resolve",
      target: body.id,
      approved: true,
      actorId: auth.user.id,
      actorEmail: auth.user.email,
    });
    return NextResponse.json({ event });
  }

  return NextResponse.json({ error: "Unknown intent" }, { status: 400 });
}
