import "server-only";

import { getConfig } from "../config";

const g = globalThis as unknown as {
  __slackDedup?: Map<string, number>;
  __upstash?: import("@upstash/redis").Redis | null;
};

const TTL_SEC = 60 * 60;
const MEM_PRUNE_MS = TTL_SEC * 1000;

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
    const remote = await upstashClaim(key);
    if (remote === false) return false;
    if (remote === true) continue;
    if (!memoryClaim(key)) return false;
  }
  return true;
}
