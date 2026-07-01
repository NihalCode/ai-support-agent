import "server-only";

import { randomUUID } from "node:crypto";

import { pgQuery, isPostgresConfigured } from "@/lib/db/postgres";
import type { KnowledgeSource, KnowledgeSourceStatus, KnowledgeSourceType } from "../types";
import {
  defaultOrgId,
  enterpriseDataDir,
  readJsonArrayFile,
  writeJsonArrayFile,
} from "../file-store";

function sourcesFile(): string {
  return `${enterpriseDataDir("knowledge")}/sources.json`;
}

function rowToSource(row: Record<string, unknown>): KnowledgeSource {
  return {
    id: String(row.id),
    type: String(row.type) as KnowledgeSourceType,
    name: String(row.name),
    externalId: row.external_id ? String(row.external_id) : undefined,
    url: row.url ? String(row.url) : undefined,
    status: String(row.status) as KnowledgeSourceStatus,
    lastSyncedAt: row.last_synced_at
      ? new Date(String(row.last_synced_at)).toISOString()
      : undefined,
    createdByUserId: String(row.created_by_user_id ?? "system"),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function listKnowledgeSources(): Promise<KnowledgeSource[]> {
  if (isPostgresConfigured()) {
    const rows = await pgQuery`
      SELECT * FROM knowledge_sources WHERE org_id = ${defaultOrgId()} ORDER BY updated_at DESC
    `;
    return rows.map(rowToSource);
  }
  return readJsonArrayFile<KnowledgeSource>(sourcesFile());
}

export async function getKnowledgeSource(id: string): Promise<KnowledgeSource | null> {
  if (isPostgresConfigured()) {
    const rows = await pgQuery`
      SELECT * FROM knowledge_sources WHERE id = ${id} AND org_id = ${defaultOrgId()} LIMIT 1
    `;
    return rows[0] ? rowToSource(rows[0]) : null;
  }
  return readJsonArrayFile<KnowledgeSource>(sourcesFile()).find((s) => s.id === id) ?? null;
}

export async function upsertKnowledgeSource(input: {
  id?: string;
  type: KnowledgeSourceType;
  name: string;
  externalId?: string;
  url?: string;
  status?: KnowledgeSourceStatus;
  lastSyncedAt?: string;
  createdByUserId?: string;
}): Promise<KnowledgeSource> {
  const now = new Date().toISOString();
  const existing = input.id ? await getKnowledgeSource(input.id) : null;
  const source: KnowledgeSource = {
    id: input.id ?? randomUUID(),
    type: input.type,
    name: input.name,
    externalId: input.externalId ?? existing?.externalId,
    url: input.url ?? existing?.url,
    status: input.status ?? existing?.status ?? "stale",
    lastSyncedAt: input.lastSyncedAt ?? existing?.lastSyncedAt,
    createdByUserId: input.createdByUserId ?? existing?.createdByUserId ?? "system",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  if (isPostgresConfigured()) {
    await pgQuery`
      INSERT INTO knowledge_sources (
        id, org_id, type, name, external_id, url, status, last_synced_at,
        created_by_user_id, created_at, updated_at
      ) VALUES (
        ${source.id}, ${defaultOrgId()}, ${source.type}, ${source.name},
        ${source.externalId ?? null}, ${source.url ?? null}, ${source.status},
        ${source.lastSyncedAt ?? null}, ${source.createdByUserId}, ${source.createdAt}, ${source.updatedAt}
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        external_id = EXCLUDED.external_id,
        url = EXCLUDED.url,
        status = EXCLUDED.status,
        last_synced_at = EXCLUDED.last_synced_at,
        updated_at = EXCLUDED.updated_at
    `;
    return source;
  }

  const all = readJsonArrayFile<KnowledgeSource>(sourcesFile());
  const idx = all.findIndex((s) => s.id === source.id);
  if (idx >= 0) all[idx] = source;
  else all.unshift(source);
  writeJsonArrayFile(sourcesFile(), all);
  return source;
}

export async function deleteKnowledgeSource(id: string): Promise<boolean> {
  if (isPostgresConfigured()) {
    await pgQuery`DELETE FROM knowledge_sources WHERE id = ${id} AND org_id = ${defaultOrgId()}`;
    return true;
  }
  const all = readJsonArrayFile<KnowledgeSource>(sourcesFile());
  const next = all.filter((s) => s.id !== id);
  writeJsonArrayFile(sourcesFile(), next);
  return next.length !== all.length;
}
