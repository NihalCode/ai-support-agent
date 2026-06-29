import { NextResponse } from "next/server";

import { getConfig } from "@/lib/support/config";
import { audit } from "@/lib/support/audit";
import { redact } from "@/lib/support/redact";
import { postSlackMessage } from "@/lib/support/slack/client";
import { verifySlackSignature } from "@/lib/support/slack/signature";
import { appendSlackThreadMessage, getSlackThread } from "@/lib/support/slack/thread-store";
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
  };
}

type SlackEventBody = SlackUrlVerification | SlackEventCallback;

async function verify(req: Request, rawBody: string): Promise<NextResponse | null> {
  if (isTestMode()) return null;
  const cfg = getConfig();
  const verdict = verifySlackSignature({
    signingSecret: cfg.slack.signingSecret,
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
  if (!event || event.bot_id || !event.channel || !event.ts) {
    return NextResponse.json({ ok: true });
  }

  if (event.type !== "app_mention" && event.type !== "message") {
    return NextResponse.json({ ok: true });
  }

  const threadTs = event.thread_ts ?? event.ts;
  const text = redact(event.text ?? "");
  const thread = appendSlackThreadMessage({
    channelId: event.channel,
    threadTs,
    teamId: body.team_id,
    message: {
      role: "user",
      userId: event.user,
      text,
    },
  });

  const prior = getSlackThread(event.channel, threadTs);
  const reply =
    prior && prior.messages.length > 1
      ? "I added this to the support thread context. Open AI Support Studio for the full investigation, or create an approval card for any write action."
      : "I’m tracking this support thread. Share a ticket, request ID, endpoint, or error and I’ll keep the context together.";

  await postSlackMessage({
    channel: event.channel,
    threadTs,
    text: reply,
  }).catch(() => undefined);

  appendSlackThreadMessage({
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
    details: `stored ${thread.messages.length} message(s) in thread memory`,
  });

  return NextResponse.json({ ok: true });
}
