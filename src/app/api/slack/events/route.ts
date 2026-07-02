import { after, NextResponse } from "next/server";

import { audit } from "@/lib/support/enterprise/audit-log";
import { slackSigningSecret } from "@/lib/support/slack/credentials";
import { handleSlackEventPayload } from "@/lib/support/slack/handle-event";
import { verifySlackSignature } from "@/lib/support/slack/signature";
import { isTestMode } from "@/lib/test-mode";

export const runtime = "nodejs";

interface SlackUrlVerification {
  type: "url_verification";
  challenge: string;
}

interface SlackEventCallback {
  type: "event_callback";
  event_id?: string;
  team_id?: string;
  event: {
    type: string;
    channel?: string;
    channel_type?: string;
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

  const payload = {
    eventId: body.event_id,
    teamId: body.team_id,
    event,
  };

  after(async () => {
    await handleSlackEventPayload(payload);
  });

  return NextResponse.json({ ok: true });
}
