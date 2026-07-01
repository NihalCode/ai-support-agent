import "server-only";

import type { AuditEntry } from "../types";
import { audit as legacyAudit, readAudit as legacyReadAudit } from "../audit";
import { appendAuditLog, listAuditLogs } from "./stores/audit-store";
import type { AuditLogStatus, AuditTargetSystem } from "./types";

export { enterpriseAuditBackend } from "./stores/audit-store";

function mapProvider(provider?: string): AuditTargetSystem {
  switch (provider) {
    case "jira":
      return "jira";
    case "zendesk":
      return "zendesk";
    case "confluence":
      return "confluence";
    case "slack":
      return "slack";
    case "build-app":
      return "vercel";
    case "mcp":
      return "mcp";
    default:
      return "app";
  }
}

function mapStatus(entry: Omit<AuditEntry, "timestamp">): AuditLogStatus {
  if (entry.approved === false && entry.action.includes("reject")) return "rejected";
  if (entry.approved === false) return "failed";
  if (entry.action.startsWith("approval:create")) return "requested";
  if (entry.action.startsWith("approval:approve")) return "approved";
  return "completed";
}

/** Unified audit — writes legacy JSONL + durable enterprise store. */
export async function recordAudit(entry: Omit<AuditEntry, "timestamp">): Promise<void> {
  await legacyAudit(entry);
  await appendAuditLog({
    actorUserId: entry.actorId,
    actorEmail: entry.actorEmail,
    action: entry.action,
    targetSystem: mapProvider(entry.provider),
    targetId: entry.target,
    status: mapStatus(entry),
    metadata: {
      approved: entry.approved,
      details: entry.details,
      safetyClass: entry.safetyClass,
      orgId: entry.orgId,
    },
  }).catch(() => undefined);
}

/** Back-compat alias used across the codebase. */
export async function audit(entry: Omit<AuditEntry, "timestamp">): Promise<void> {
  return recordAudit(entry);
}

export async function readUnifiedAudit(limit = 100) {
  const enterprise = await listAuditLogs({ limit });
  if (enterprise.length > 0) {
    return {
      backend: enterprise.length ? "enterprise" : "legacy",
      entries: enterprise,
    };
  }
  const legacy = await legacyReadAudit(limit);
  return { backend: "legacy", entries: legacy };
}

export async function readEnterpriseAudit(limit = 200) {
  return listAuditLogs({ limit });
}
