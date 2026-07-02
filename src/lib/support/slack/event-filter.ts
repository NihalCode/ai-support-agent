const BOT_MENTION = /<@[A-Z0-9]+>/;

export interface SlackIncomingEvent {
  type: string;
  channel?: string;
  user?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  bot_id?: string;
  subtype?: string;
  channel_type?: string;
}

/** Decide whether this Slack event should trigger exactly one bot reply. */
export function shouldHandleSlackEvent(
  envelopeType: string,
  event: SlackIncomingEvent,
  opts?: { threadHasSession?: boolean }
): boolean {
  if (envelopeType !== "event_callback" || !event) return false;
  if (event.bot_id || event.subtype || !event.channel || !event.ts) return false;

  const text = event.text ?? "";
  const channelType = event.channel_type ?? "";
  const isDm = channelType === "im" || event.channel.startsWith("D");

  if (event.type === "app_mention") return true;

  if (event.type !== "message") return false;

  // @mentions are handled by app_mention — skip the duplicate message event.
  if (BOT_MENTION.test(text)) return false;

  if (isDm) return true;

  // Thread follow-up without re-mentioning the bot (only when we already started work).
  if (event.thread_ts && event.thread_ts !== event.ts && opts?.threadHasSession) {
    return true;
  }

  return false;
}
