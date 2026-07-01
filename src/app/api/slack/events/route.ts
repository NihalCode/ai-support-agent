import { NextResponse } from "next/server";

import { audit } from "@/lib/support/enterprise/audit-log";
import { redact } from "@/lib/support/redact";
import { postSlackMessage } from "@/lib/support/slack/client";
import { slackSigningSecret } from "@/lib/support/slack/credentials";
import { enrichSlackThread } from "@/lib/support/slack/enrich-thread";
import { verifySlackSignature } from "@/lib/support/slack/signature";
import { appendSlackThreadMessage } from "@/lib/support/slack/thread-store";
import { isTestMode } from "@/lib/test-mode";

export const runtime = "nodejs";

interface SlackUrlVerification {
  type: "url_verification";
  challenge: string;
}

interface SlackEventCallback {
  type: "event_callback";
  team_id?: string;
  event: {
    type: string;
    channel?: string;
    user?: string;
    text?: string;
    ts?: string;
    thread_ts?: string;
    bot_id?: string;
    subtype?: string;
  };
}

type SlackEventBody = SlackUrlVerification | SlackEventCallback;

async function verify(req: Request, rawBody: string): Promise<NextResponse | null> {
  if (isTestMode()) return null;
  const signingSecret = await slackSigningSecret();
  const verdict = verifySlackSignature({
    signingSecret,
    timestamp: req.headers.get("x-slack-request-timestamp"),
    signature: req.headers.get("x-slack-signature"),
    rawBody,
  });
  if (!verdict.ok) {
    await audit({ action: "slack:signature", approved: false, details: verdict.reason });
    return NextResponse.json({ error: verdict.reason }, { status: 401 });
  }
  return null;
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const failed = await verify(req, rawBody);
  if (failed) return failed;

  let body: SlackEventBody;
  try {
    body = JSON.parse(rawBody) as SlackEventBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge });
  }

  const event = body.event;
  if (!event || event.bot_id || event.subtype || !event.channel || !event.ts) {
    return NextResponse.json({ ok: true });
  }

  if (event.type !== "app_mention" && event.type !== "message") {
    return NextResponse.json({ ok: true });
  }

  const threadTs = event.thread_ts ?? event.ts;
  const text = redact(event.text ?? "");

  await appendSlackThreadMessage({
    channelId: event.channel,
    threadTs,
    teamId: body.team_id,
    message: {
      role: "user",
      userId: event.user,
      text,
    },
  });

  let reply: string;
  let sessionId: string | undefined;
  try {
    const enriched = await enrichSlackThread({
      channelId: event.channel,
      threadTs,
      latestMessage: text,
      teamId: body.team_id,
    });
    reply = enriched.text;
    sessionId = enriched.sessionId;
  } catch (err) {
    reply =
      "I hit an error running the investigation. Open AI Support Studio for the full workflow, or try again with a ticket key or endpoint.";
    await audit({
      action: "slack:enrich-error",
      target: `${event.channel}:${threadTs}`,
      approved: false,
      provider: "slack",
      details: err instanceof Error ? err.message : String(err),
    });
  }

  await postSlackMessage({
    channel: event.channel,
    threadTs,
    text: reply,
  }).catch(() => undefined);

  await appendSlackThreadMessage({
    channelId: event.channel,
    threadTs,
    teamId: body.team_id,
    message: { role: "assistant", text: reply },
  });

  await audit({
    action: "slack:event",
    target: `${event.channel}:${threadTs}`,
    approved: true,
    provider: "slack",
    details: sessionId ? `investigation ${sessionId}` : "thread reply",
  });

  return NextResponse.json({ ok: true });
}
