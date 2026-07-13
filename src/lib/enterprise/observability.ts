import { randomBytes, randomUUID } from "node:crypto";

const SAFE_ID = /^[a-zA-Z0-9._:/-]{1,128}$/;
const TRACEPARENT =
  /^[\da-f]{2}-([\da-f]{32})-([\da-f]{16})-[\da-f]{2}$/i;
const SENSITIVE_KEY =
  /(authorization|cookie|token|secret|password|signature|api[-_]?key|credential|private[-_]?key)/i;
const SECRET_VALUE =
  /(bearer\s+[a-z0-9._~+/-]+=*|ix_[a-z0-9_-]{16,}|-----BEGIN [A-Z ]+PRIVATE KEY-----)/gi;

export interface EnterpriseRequestIds {
  correlationId: string;
  requestId: string;
  traceId: string;
}

function safeHeaderId(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed && SAFE_ID.test(trimmed) ? trimmed : null;
}

export function enterpriseRequestIds(headers?: Headers): EnterpriseRequestIds {
  const traceMatch = headers?.get("traceparent")?.trim().match(TRACEPARENT);
  const suppliedTrace = traceMatch?.[1];
  return {
    correlationId:
      safeHeaderId(headers?.get("x-correlation-id") ?? null) ?? randomUUID(),
    requestId:
      safeHeaderId(headers?.get("x-request-id") ?? null) ?? randomUUID(),
    traceId:
      suppliedTrace && !/^0+$/.test(suppliedTrace)
        ? suppliedTrace.toLowerCase()
        : randomBytes(16).toString("hex"),
  };
}

export function redactEnterpriseValue<T>(value: T, depth = 0): T {
  if (depth > 10) return "[REDACTED]" as T;
  if (typeof value === "string") {
    return value.replace(SECRET_VALUE, "[REDACTED]") as T;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactEnterpriseValue(entry, depth + 1)) as T;
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      output[key] = SENSITIVE_KEY.test(key)
        ? "[REDACTED]"
        : redactEnterpriseValue(entry, depth + 1);
    }
    return output as T;
  }
  return value;
}

export function logEnterpriseEvent(input: {
  event: string;
  outcome: "success" | "failure" | "denied";
  ids: EnterpriseRequestIds;
  organizationId?: string;
  actorUserId?: string;
  metadata?: Record<string, unknown>;
}): void {
  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      category: "enterprise_control_plane",
      event: input.event,
      outcome: input.outcome,
      ...input.ids,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      metadata: redactEnterpriseValue(input.metadata ?? {}),
    })
  );
}
