import "server-only";

import { redact } from "../redact";

const SECRET_KEYS =
  /secret|token|password|apikey|api_key|authorization|credential|signature|private/i;

/** Strip secret-like values from audit/approval metadata before persistence. */
export function redactMetadata(
  input: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!input) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (SECRET_KEYS.test(key)) {
      out[key] = "[REDACTED]";
      continue;
    }
    if (typeof value === "string") {
      out[key] = redact(value);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = redactMetadata(value as Record<string, unknown>) ?? {};
    } else {
      out[key] = value;
    }
  }
  return out;
}
