import "server-only";

import { audit } from "@/lib/support/enterprise/audit-log";
import { redact } from "@/lib/support/redact";

import { postSlackMessage } from "./client";
import { claimSlackEventDelivery } from "./event-dedup";
import { shouldHandleSlackEvent, type SlackIncomingEvent } from "./event-filter";
import { enrichSlackThread } from "./enrich-thread";
import { appendSlackThreadMessage, getSlackThread } from "./thread-store";

export interface SlackEventPayload {
  eventId?: string;
  teamId?: string;
  event: SlackIncomingEvent;
}

export async function handleSlackEventPayload(payload: SlackEventPayload): Promise<void> {
  const event = payload.event;
  if (!event.channel || !event.ts) return;

  const threadTs = event.thread_ts ?? event.ts;
  const thread = await getSlackThread(event.channel, threadTs, payload.teamId);

  if (
    !shouldHandleSlackEvent("event_callback", event, {
      threadHasSession: Boolean(thread?.investigationSessionId),
    })
  ) {
    return;
  }

  const claimed = await claimSlackEventDelivery({
    eventId: payload.eventId,
    channelId: event.channel,
    messageTs: event.ts,
  });
  if (!claimed) return;

  const text = redact(event.text ?? "");

  await appendSlackThreadMessage({
    channelId: event.channel,
    threadTs,
    teamId: payload.teamId,
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
      teamId: payload.teamId,
    });
    if (!enriched.text.trim()) return;
    reply = enriched.text;
    sessionId = enriched.sessionId;
  } catch (err) {
    reply =
      "I hit an error running the investigation. Open AI Support Studio for the full workflow, or try again with more detail about the issue.";
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
    teamId: payload.teamId,
    message: { role: "assistant", text: reply },
  });

  await audit({
    action: "slack:event",
    target: `${event.channel}:${threadTs}`,
    approved: true,
    provider: "slack",
    details: sessionId ? `investigation ${sessionId}` : "thread reply",
  });
}
