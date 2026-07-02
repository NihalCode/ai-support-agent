import "server-only";

import { isPostgresConfigured, pgQuery } from "@/lib/db/postgres";
import { getConfig } from "../config";

const g = globalThis as unknown as {
  __slackDedup?: Map<string, number>;
  __upstash?: import("@upstash/redis").Redis | null;
  __slackDedupTableReady?: boolean;
};

const TTL_SEC = 60 * 60;
const MEM_PRUNE_MS = TTL_SEC * 1000;

/** Hard cap on bot posts per Slack thread (initial investigation + one follow-up). */
export const MAX_BOT_REPLIES_PER_THREAD = 2;

function memoryClaim(key: string): boolean {
  const now = Date.now();
  const map = (g.__slackDedup ??= new Map());
  for (const [k, exp] of map) {
    if (exp <= now) map.delete(k);
  }
  if (map.has(key)) return false;
  map.set(key, now + MEM_PRUNE_MS);
  return true;
}

async function ensureDedupTable(): Promise<void> {
  if (g.__slackDedupTableReady || !isPostgresConfigured()) return;
  await pgQuery`
    CREATE TABLE IF NOT EXISTS slack_event_dedup (
      dedup_key TEXT PRIMARY KEY,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `;
  g.__slackDedupTableReady = true;
}

async function postgresClaim(key: string): Promise<boolean | null> {
  if (!isPostgresConfigured()) return null;
  await ensureDedupTable();
  const rows = await pgQuery`
    INSERT INTO slack_event_dedup (dedup_key, expires_at)
    VALUES (${key}, NOW() + INTERVAL '1 hour')
    ON CONFLICT (dedup_key) DO NOTHING
    RETURNING dedup_key
  `;
  return rows.length > 0;
}

async function upstashClaim(key: string): Promise<boolean | null> {
  const cfg = getConfig();
  if (!cfg.upstash.restUrl || !cfg.upstash.restToken) return null;
  if (!g.__upstash) {
    const { Redis } = await import("@upstash/redis");
    g.__upstash = new Redis({ url: cfg.upstash.restUrl, token: cfg.upstash.restToken });
  }
  const client = g.__upstash;
  if (!client) return null;
  const result = await client.set(key, "1", { ex: TTL_SEC, nx: true });
  return result === "OK";
}

async function claimKey(key: string): Promise<boolean> {
  const pg = await postgresClaim(key);
  if (pg === true) return true;
  if (pg === false) return false;

  const remote = await upstashClaim(key);
  if (remote === true) return true;
  if (remote === false) return false;

  return memoryClaim(key);
}

/** Returns true only the first time this Slack delivery should be processed. */
export async function claimSlackEventDelivery(input: {
  eventId?: string;
  channelId: string;
  messageTs: string;
}): Promise<boolean> {
  const keys = [
    input.eventId ? `slack:evt:${input.eventId}` : null,
    `slack:msg:${input.channelId}:${input.messageTs}`,
  ].filter(Boolean) as string[];

  for (const key of keys) {
    if (!(await claimKey(key))) return false;
  }
  return true;
}

/** One bot reply per user message — prevents duplicate posts for the same trigger. */
export async function claimSlackUserMessageReply(input: {
  channelId: string;
  userMessageTs: string;
}): Promise<boolean> {
  return claimKey(`slack:reply:${input.channelId}:${input.userMessageTs}`);
}

/** Cap total bot replies in a thread (investigation + one follow-up). */
export async function claimSlackThreadReplySlot(input: {
  channelId: string;
  threadTs: string;
  maxReplies?: number;
}): Promise<boolean> {
  const max = input.maxReplies ?? MAX_BOT_REPLIES_PER_THREAD;
  for (let i = 1; i <= max; i++) {
    if (await claimKey(`slack:thread:${input.channelId}:${input.threadTs}:${i}`)) {
      return true;
    }
  }
  return false;
}

/** One Slack interactive action (approve/reject) per user + action + approval. */
export async function claimSlackInteraction(input: {
  teamId?: string;
  userId?: string;
  actionTs?: string;
  approvalId: string;
  decision: string;
}): Promise<boolean> {
  const key = `slack:ix:${input.teamId ?? "team"}:${input.userId ?? "user"}:${input.actionTs ?? "ts"}:${input.decision}:${input.approvalId}`;
  return claimKey(key);
}
