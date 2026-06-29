import "server-only";

import { getConfig } from "./config";

/**
 * Secret redaction for anything that may surface in the UI, an audit log, or an
 * error message. Two layers:
 *   1. Exact-match scrubbing of known secret values pulled from config.
 *   2. Pattern-based scrubbing of common credential shapes (bearer tokens,
 *      basic-auth headers, api keys, atlassian/openai/github token prefixes).
 *
 * Never log or display request/response text without passing it through here.
 */

const REDACTED = "«redacted»";

function knownSecrets(): string[] {
  const c = getConfig();
  return [
    c.openaiApiKey,
    c.pinecone.apiKey,
    c.github.token,
    c.jira.apiToken,
    c.zendesk.apiToken,
    c.confluence.apiToken,
    c.slack.botToken,
    c.slack.signingSecret,
    c.cyware.apiKey,
    c.cyware.clientSecret,
    c.encryptionKey,
    ...c.mcpServers.flatMap((s) => Object.values(s.headers ?? {})),
  ].filter((v): v is string => typeof v === "string" && v.length >= 6);
}

const PATTERNS: { re: RegExp; replace: string }[] = [
  // Authorization: Bearer xxx / Basic xxx
  { re: /(authorization"?\s*[:=]\s*"?)(bearer|basic)\s+[A-Za-z0-9._\-+/=]+/gi, replace: `$1$2 ${REDACTED}` },
  // Common provider key prefixes.
  { re: /\b(sk-[A-Za-z0-9]{8,})\b/g, replace: REDACTED },
  { re: /\b(pcsk_[A-Za-z0-9_\-]{8,})\b/g, replace: REDACTED },
  { re: /\b(gh[pousr]_[A-Za-z0-9]{20,})\b/g, replace: REDACTED },
  { re: /\b(xox[baprs]-[A-Za-z0-9-]{8,})\b/g, replace: REDACTED },
  // Atlassian API tokens (ATATT...) and generic api_token JSON fields.
  { re: /\bATATT[A-Za-z0-9._\-=]{8,}\b/g, replace: REDACTED },
  { re: /("(?:api[_-]?key|api[_-]?token|secret|password|client[_-]?secret|token)"\s*:\s*")[^"]+(")/gi, replace: `$1${REDACTED}$2` },
];

/** Redact secrets from a plain string. Safe to call on any user-facing text. */
export function redact(input: string): string {
  if (!input) return input;
  let out = input;
  for (const secret of knownSecrets()) {
    out = out.split(secret).join(REDACTED);
  }
  for (const { re, replace } of PATTERNS) {
    out = out.replace(re, replace);
  }
  return out;
}

/** Deep-redact an object/array/string for logging or API responses. */
export function redactDeep<T>(value: T): T {
  if (typeof value === "string") return redact(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Drop obvious secret-bearing keys entirely.
      if (/^(authorization|api[_-]?key|api[_-]?token|secret|password|client[_-]?secret|token)$/i.test(k)) {
        out[k] = REDACTED;
      } else {
        out[k] = redactDeep(v);
      }
    }
    return out as unknown as T;
  }
  return value;
}

/** Redact a Headers/record map, returning a display-safe object. */
export function redactHeaders(
  headers: Record<string, string> | undefined
): Record<string, string> {
  if (!headers) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = /^(authorization|x-api-key|api[_-]?key|cookie)$/i.test(k)
      ? REDACTED
      : redact(v);
  }
  return out;
}
