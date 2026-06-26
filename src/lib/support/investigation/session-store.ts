import "server-only";

import type { InvestigationContext } from "./types";
import { getConfig } from "../config";

const g = globalThis as unknown as {
  __investigationSessions?: Map<string, InvestigationContext>;
  __redisClient?: {
    get(key: string): Promise<string | null>;
    setEx(key: string, ttl: number, value: string): Promise<string>;
    del(key: string): Promise<number>;
  } | null;
  __upstash?: { get: (k: string) => Promise<unknown>; set: (k: string, v: unknown, o?: { ex: number }) => Promise<unknown>; del: (k: string) => Promise<unknown> } | null;
  __redisUnavailable?: boolean;
  __sessionBackend?: "upstash-rest" | "redis" | "memory";
};

const memory: Map<string, InvestigationContext> = (g.__investigationSessions ??= new Map());

const MAX_SESSIONS = 100;
const TTL_MS = 1000 * 60 * 60 * 4;
const TTL_SEC = Math.floor(TTL_MS / 1000);
const KEY_PREFIX = "inv:session:";

function upstashConfigured(): boolean {
  const cfg = getConfig();
  return Boolean(cfg.upstash.restUrl && cfg.upstash.restToken);
}

async function getUpstash() {
  if (g.__upstash) return g.__upstash;
  if (!upstashConfigured()) return null;
  const cfg = getConfig();
  const { Redis } = await import("@upstash/redis");
  g.__upstash = new Redis({ url: cfg.upstash.restUrl!, token: cfg.upstash.restToken! });
  return g.__upstash;
}

async function getRedisClient(): Promise<NonNullable<typeof g.__redisClient> | null> {
  if (g.__redisUnavailable) return null;
  const url = getConfig().redisUrl;
  if (!url) return null;
  if (g.__redisClient) return g.__redisClient;
  try {
    const { createClient } = await import("redis");
    const client = createClient({ url });
    client.on("error", () => {
      g.__redisUnavailable = true;
    });
    await client.connect();
    g.__redisClient = client;
    return client;
  } catch {
    g.__redisUnavailable = true;
    return null;
  }
}

export function sessionBackendStatus(): "upstash-rest" | "redis" | "memory" {
  return g.__sessionBackend ?? (upstashConfigured() ? "upstash-rest" : getConfig().redisUrl ? "redis" : "memory");
}

function trimMemory(): void {
  if (memory.size <= MAX_SESSIONS) return;
  const oldest = [...memory.entries()].sort((a, b) =>
    a[1].updatedAt.localeCompare(b[1].updatedAt)
  )[0]?.[0];
  if (oldest) memory.delete(oldest);
}

/** Keep Redis payloads bounded for serverless. */
function slimForStore(ctx: InvestigationContext): InvestigationContext {
  return {
    ...ctx,
    evidence: ctx.evidence.map((e) => ({
      ...e,
      summary: e.summary.slice(0, 800),
    })),
    chatHistory: ctx.chatHistory.slice(-40),
  };
}

async function persistSession(key: string, ctx: InvestigationContext): Promise<void> {
  const slim = slimForStore(ctx);
  const upstash = await getUpstash();
  if (upstash) {
    await upstash.set(key, slim, { ex: TTL_SEC });
    g.__sessionBackend = "upstash-rest";
    return;
  }
  const redis = await getRedisClient();
  if (redis) {
    await redis.setEx(key, TTL_SEC, JSON.stringify(slim));
    g.__sessionBackend = "redis";
  }
}

async function loadSession(key: string): Promise<InvestigationContext | null> {
  const upstash = await getUpstash();
  if (upstash) {
    const raw = (await upstash.get(key)) as InvestigationContext | null;
    if (raw && typeof raw === "object" && "sessionId" in raw) {
      g.__sessionBackend = "upstash-rest";
      return raw;
    }
  }
  const redis = await getRedisClient();
  if (redis) {
    const raw = await redis.get(key);
    if (raw) {
      g.__sessionBackend = "redis";
      return JSON.parse(raw) as InvestigationContext;
    }
  }
  return null;
}

async function deleteSession(key: string): Promise<void> {
  const upstash = await getUpstash();
  if (upstash) {
    await upstash.del(key).catch(() => undefined);
    return;
  }
  const redis = await getRedisClient();
  if (redis) await redis.del(key).catch(() => undefined);
}

export async function saveSession(ctx: InvestigationContext): Promise<void> {
  memory.set(ctx.sessionId, ctx);
  trimMemory();
  const key = KEY_PREFIX + ctx.sessionId;
  try {
    await persistSession(key, ctx);
  } catch (err) {
    g.__sessionBackend = "memory";
    console.error("[session-store] persist failed:", err instanceof Error ? err.message : err);
  }
}

export async function getSession(id: string): Promise<InvestigationContext | null> {
  const key = KEY_PREFIX + id;

  try {
    const parsed = await loadSession(key);
    if (parsed) {
      memory.set(id, parsed);
      return parsed;
    }
  } catch (err) {
    console.error("[session-store] load failed:", err instanceof Error ? err.message : err);
  }

  const ctx = memory.get(id);
  if (!ctx) return null;
  if (Date.now() - new Date(ctx.updatedAt).getTime() > TTL_MS) {
    memory.delete(id);
    await deleteSession(key);
    return null;
  }
  return ctx;
}

export async function pingSessionStore(): Promise<"upstash-rest" | "redis" | "memory"> {
  if (upstashConfigured()) {
    try {
      const upstash = await getUpstash();
      if (upstash) {
        await upstash.set("__ping", "1", { ex: 10 });
        await upstash.del("__ping");
        g.__sessionBackend = "upstash-rest";
        return "upstash-rest";
      }
    } catch {
      /* fall through */
    }
  }
  const redis = await getRedisClient();
  if (redis) {
    try {
      await redis.setEx("__ping", 10, "1");
      await redis.del("__ping");
      g.__sessionBackend = "redis";
      return "redis";
    } catch {
      g.__redisUnavailable = true;
    }
  }
  g.__sessionBackend = "memory";
  return "memory";
}

export function newSessionId(): string {
  return `inv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
