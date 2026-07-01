import "server-only";

import { randomUUID } from "node:crypto";

import { pgQuery, isPostgresConfigured } from "@/lib/db/postgres";
import type {
  AuditLogStatus,
  AuditTargetSystem,
  EnterpriseAuditLog,
} from "../types";
import { redactMetadata } from "../redact-metadata";
import {
  defaultOrgId,
  enterpriseDataDir,
  readJsonArrayFile,
  writeJsonArrayFile,
} from "../file-store";

const MAX_ENTRIES = 2000;

function auditFile(): string {
  return `${enterpriseDataDir("audit")}/logs.json`;
}

function rowToAudit(row: Record<string, unknown>): EnterpriseAuditLog {
  return {
    id: String(row.id),
    actorUserId: String(row.actor_user_id ?? "system"),
    actorEmail: row.actor_email ? String(row.actor_email) : undefined,
    action: String(row.action),
    targetSystem: String(row.target_system) as AuditTargetSystem,
    targetId: row.target_id ? String(row.target_id) : undefined,
    status: String(row.status) as AuditLogStatus,
    metadata: row.metadata as Record<string, unknown> | undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export async function appendAuditLog(input: {
  actorUserId?: string;
  actorEmail?: string;
  action: string;
  targetSystem?: AuditTargetSystem;
  targetId?: string;
  status?: AuditLogStatus;
  metadata?: Record<string, unknown>;
}): Promise<EnterpriseAuditLog> {
  const entry: EnterpriseAuditLog = {
    id: randomUUID(),
    actorUserId: input.actorUserId ?? "system",
    actorEmail: input.actorEmail,
    action: input.action,
    targetSystem: input.targetSystem ?? "app",
    targetId: input.targetId,
    status: input.status ?? "completed",
    metadata: redactMetadata(input.metadata),
    createdAt: new Date().toISOString(),
  };

  if (isPostgresConfigured()) {
    await pgQuery`
      INSERT INTO audit_logs (
        id, org_id, actor_user_id, actor_email, action, target_system, target_id, status, metadata, created_at
      ) VALUES (
        ${entry.id}, ${defaultOrgId()}, ${entry.actorUserId}, ${entry.actorEmail ?? null},
        ${entry.action}, ${entry.targetSystem}, ${entry.targetId ?? null}, ${entry.status},
        ${entry.metadata ? JSON.stringify(entry.metadata) : null}, ${entry.createdAt}
      )
    `;
    return entry;
  }

  const all = readJsonArrayFile<EnterpriseAuditLog>(auditFile());
  all.unshift(entry);
  writeJsonArrayFile(auditFile(), all.slice(0, MAX_ENTRIES));
  return entry;
}

export async function listAuditLogs(filters?: {
  actorUserId?: string;
  action?: string;
  targetSystem?: AuditTargetSystem;
  status?: AuditLogStatus;
  limit?: number;
}): Promise<EnterpriseAuditLog[]> {
  const limit = filters?.limit ?? 200;
  if (isPostgresConfigured()) {
    const org = defaultOrgId();
    const rows = await pgQuery`
      SELECT * FROM audit_logs
      WHERE org_id = ${org}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    let items = rows.map(rowToAudit);
    if (filters?.actorUserId) items = items.filter((e) => e.actorUserId === filters.actorUserId);
    if (filters?.action) items = items.filter((e) => e.action.includes(filters.action!));
    if (filters?.targetSystem) items = items.filter((e) => e.targetSystem === filters.targetSystem);
    if (filters?.status) items = items.filter((e) => e.status === filters.status);
    return items;
  }
  let items = readJsonArrayFile<EnterpriseAuditLog>(auditFile());
  if (filters?.actorUserId) items = items.filter((e) => e.actorUserId === filters.actorUserId);
  if (filters?.action) items = items.filter((e) => e.action.includes(filters.action!));
  if (filters?.targetSystem) items = items.filter((e) => e.targetSystem === filters.targetSystem);
  if (filters?.status) items = items.filter((e) => e.status === filters.status);
  return items.slice(0, limit);
}

export function enterpriseAuditBackend(): "postgres" | "file" {
  return isPostgresConfigured() ? "postgres" : "file";
}
