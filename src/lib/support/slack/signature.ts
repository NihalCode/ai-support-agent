import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_SKEW_SECONDS = 60 * 5;

export function buildSlackSignatureBase(timestamp: string, rawBody: string): string {
  return `v0:${timestamp}:${rawBody}`;
}

export function signSlackBody(secret: string, timestamp: string, rawBody: string): string {
  return (
    "v0=" +
    createHmac("sha256", secret)
      .update(buildSlackSignatureBase(timestamp, rawBody))
      .digest("hex")
  );
}

export function verifySlackSignature(input: {
  signingSecret: string | null;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  nowSeconds?: number;
}): { ok: boolean; reason?: string } {
  if (!input.signingSecret) return { ok: false, reason: "Slack signing secret not configured" };
  if (!input.timestamp || !input.signature) return { ok: false, reason: "Missing Slack signature headers" };

  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "Invalid Slack timestamp" };
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > MAX_SKEW_SECONDS) {
    return { ok: false, reason: "Stale Slack request timestamp" };
  }

  const expected = signSlackBody(input.signingSecret, input.timestamp, input.rawBody);
  const a = Buffer.from(expected);
  const b = Buffer.from(input.signature);
  if (a.length !== b.length) return { ok: false, reason: "Invalid Slack signature" };
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: "Invalid Slack signature" };
}
