import { NextResponse } from "next/server";
import { requireSupportApi, SupportApiPermission } from "@/lib/auth/support-api-auth";
import {
  getRetentionSettings,
  updateRetentionSettings,
} from "@/lib/support/enterprise/stores/retention-store";
import { deleteSlackConversation } from "@/lib/support/enterprise/stores/slack-conversation-store";
import { deleteInvestigationLinks } from "@/lib/support/enterprise/stores/investigation-links-store";
import { audit } from "@/lib/support/enterprise/audit-log";
import type { RetentionSettings } from "@/lib/support/enterprise/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.audit, req);
  if (auth instanceof NextResponse) return auth;

  const settings = await getRetentionSettings();
  return NextResponse.json({ settings });
}

export async function POST(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.approve, req);
  if (auth instanceof NextResponse) return auth;

  let body:
    | { intent: "update_settings"; settings: RetentionSettings }
    | { intent: "delete_slack_thread"; teamId: string; channelId: string; threadTs: string }
    | { intent: "delete_investigation_links"; investigationId: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.intent === "update_settings") {
    const settings = await updateRetentionSettings(body.settings);
    await audit({
      action: "retention:update",
      approved: true,
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      details: JSON.stringify(settings),
    });
    return NextResponse.json({ settings });
  }

  if (body.intent === "delete_slack_thread") {
    await deleteSlackConversation(body.teamId, body.channelId, body.threadTs);
    await audit({
      action: "retention:delete-slack-thread",
      target: `${body.channelId}:${body.threadTs}`,
      approved: true,
      actorId: auth.user.id,
      actorEmail: auth.user.email,
    });
    return NextResponse.json({ ok: true });
  }

  if (body.intent === "delete_investigation_links") {
    await deleteInvestigationLinks(body.investigationId);
    await audit({
      action: "retention:delete-investigation-links",
      target: body.investigationId,
      approved: true,
      actorId: auth.user.id,
      actorEmail: auth.user.email,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown intent" }, { status: 400 });
}
