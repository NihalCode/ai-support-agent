import { NextResponse } from "next/server";
import { requireSupportApi, SupportApiPermission } from "@/lib/auth/support-api-auth";
import {
  getInvestigationLinks,
  upsertInvestigationLinks,
  listInvestigationLinksByTicket,
} from "@/lib/support/enterprise/stores/investigation-links-store";
import { audit } from "@/lib/support/enterprise/audit-log";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.read, req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const investigationId = url.searchParams.get("investigationId");
  const zendeskTicketId = url.searchParams.get("zendeskTicketId");

  if (investigationId) {
    const links = await getInvestigationLinks(investigationId);
    return NextResponse.json({ links });
  }
  if (zendeskTicketId) {
    const links = await listInvestigationLinksByTicket(zendeskTicketId);
    return NextResponse.json({ links });
  }

  return NextResponse.json({ error: "investigationId or zendeskTicketId required" }, { status: 400 });
}

export async function POST(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.investigate, req);
  if (auth instanceof NextResponse) return auth;

  let body: { investigationId: string; patch: Record<string, unknown> };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const links = await upsertInvestigationLinks(body.investigationId, {
    ...body.patch,
    createdByUserId: auth.user.id,
  } as Parameters<typeof upsertInvestigationLinks>[1]);

  await audit({
    action: "investigation:links:update",
    target: body.investigationId,
    approved: true,
    actorId: auth.user.id,
    actorEmail: auth.user.email,
  });

  return NextResponse.json({ links });
}
