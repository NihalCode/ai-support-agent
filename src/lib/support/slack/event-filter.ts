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

/** Decide whether this Slack event should trigger a bot reply. */
export function shouldHandleSlackEvent(
  envelopeType: string,
  event: SlackIncomingEvent
): boolean {
  if (envelopeType !== "event_callback" || !event) return false;
  if (event.bot_id || event.subtype || !event.channel || !event.ts) return false;

  const text = event.text ?? "";
  const channelType = event.channel_type ?? "";
  const isDm = channelType === "im" || event.channel.startsWith("D");

  if (event.type === "app_mention") return true;

  if (event.type !== "message") return false;

  // Channel @mentions are handled only via app_mention (avoids duplicate message events).
  if (BOT_MENTION.test(text)) return false;

  // Non-DM channel messages are ignored — users must @mention the bot (max 1 reply per mention).
  if (!isDm) return false;

  return true;
}
