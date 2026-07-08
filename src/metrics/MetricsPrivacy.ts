const BLOCKED_KEYS_EXACT = new Set([
  "token",
  "apikey",
  "api_key",
  "secret",
  "password",
  "authorization",
  "cookie",
  "session",
  "rawmessage",
  "raw_message",
  "rawticketbody",
  "raw_ticket_body",
  "filecontent",
  "file_content",
  "signature",
  "expires",
  "accessid",
  "client_secret",
  "bearer",
]);

const BLOCKED_KEY_SUBSTRINGS = [
  "apitoken",
  "refreshtoken",
  "authtoken",
  "secretkey",
] as const;

function keyBlocked(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (BLOCKED_KEYS_EXACT.has(normalized)) return true;
  return BLOCKED_KEY_SUBSTRINGS.some((frag) => normalized.includes(frag));
}

const BLOCKED_VALUE_PATTERNS = [
  /^Bearer\s+/i,
  /^Basic\s+/i,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
];

function valueBlocked(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (value.length > 500) return true;
  return BLOCKED_VALUE_PATTERNS.some((p) => p.test(value));
}

/** Strip sensitive keys/values from metrics metadata before persistence or export. */
export function sanitizeMetricsMetadata(
  metadata?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (keyBlocked(key)) continue;
    if (valueBlocked(value)) continue;

    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = sanitizeMetricsMetadata(value as Record<string, unknown>);
      if (nested && Object.keys(nested).length > 0) out[key] = nested;
      continue;
    }

    if (Array.isArray(value)) {
      const safe = value
        .map((item) => {
          if (typeof item === "string" && valueBlocked(item)) return "[redacted]";
          if (item && typeof item === "object" && !Array.isArray(item)) {
            return sanitizeMetricsMetadata(item as Record<string, unknown>) ?? "[redacted]";
          }
          return item;
        })
        .filter((item) => item !== undefined);
      if (safe.length > 0) out[key] = safe;
      continue;
    }

    if (typeof value === "string" && value.length > 300) {
      out[key] = `${value.slice(0, 300)}…`;
      continue;
    }

    out[key] = value;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

/** Ensure exported CSV rows contain no secret-like substrings. */
export function sanitizeExportCell(value: unknown): string {
  const raw = value == null ? "" : String(value);
  if (BLOCKED_VALUE_PATTERNS.some((p) => p.test(raw))) return "[redacted]";
  if (raw.length > 500) return `${raw.slice(0, 500)}…`;
  return raw.replace(/[\r\n,]/g, " ");
}
