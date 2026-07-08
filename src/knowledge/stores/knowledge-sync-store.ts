import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { isPostgresConfigured, pgQuery } from "@/lib/db/postgres";
import { defaultOrgId } from "@/lib/auth/config";
import { enterpriseDataDir, readJsonArrayFile, writeJsonArrayFile } from "@/lib/support/enterprise/file-store";
import type { KnowledgeDocumentState, KnowledgeSyncRun, KnowledgeSyncRunStatus } from "../types";

function syncRunsFile(): string {
  return `${enterpriseDataDir("knowledge-sync")}/runs.json`;
}

function documentStatesFile(): string {
  return `${enterpriseDataDir("knowledge-sync")}/documents.json`;
}

export function checksumForContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export async function listKnowledgeSyncRuns(limit = 20): Promise<KnowledgeSyncRun[]> {
  if (isPostgresConfigured()) {
    const rows = await pgQuery`
      SELECT id, started_at, completed_at, status, triggered_by, source_ids,
             downloaded_count, parsed_count, chunk_count, embedded_count,
             upserted_count, skipped_unchanged_count, failed_count, error_summary
      FROM knowledge_sync_runs
      WHERE org_id = ${defaultOrgId()}
      ORDER BY started_at DESC
      LIMIT ${limit}
    `;
    return rows.map(rowToRun);
  }
  return readJsonArrayFile<KnowledgeSyncRun>(syncRunsFile()).slice(0, limit);
}

export async function getKnowledgeSyncRun(id: string): Promise<KnowledgeSyncRun | null> {
  if (isPostgresConfigured()) {
    const rows = await pgQuery`
      SELECT id, started_at, completed_at, status, triggered_by, source_ids,
             downloaded_count, parsed_count, chunk_count, embedded_count,
             upserted_count, skipped_unchanged_count, failed_count, error_summary
      FROM knowledge_sync_runs
      WHERE id = ${id} AND org_id = ${defaultOrgId()}
      LIMIT 1
    `;
    return rows[0] ? rowToRun(rows[0]) : null;
  }
  return readJsonArrayFile<KnowledgeSyncRun>(syncRunsFile()).find((r) => r.id === id) ?? null;
}

export async function createKnowledgeSyncRun(input: {
  triggeredBy: KnowledgeSyncRun["triggeredBy"];
  sourceIds: string[];
}): Promise<KnowledgeSyncRun> {
  const run: KnowledgeSyncRun = {
    id: randomUUID(),
    startedAt: new Date().toISOString(),
    status: "running",
    triggeredBy: input.triggeredBy,
    sourceIds: input.sourceIds,
    downloadedCount: 0,
    parsedCount: 0,
    chunkCount: 0,
    embeddedCount: 0,
    upsertedCount: 0,
    skippedUnchangedCount: 0,
    failedCount: 0,
  };

  if (isPostgresConfigured()) {
    await pgQuery`
      INSERT INTO knowledge_sync_runs (
        id, org_id, started_at, status, triggered_by, source_ids,
        downloaded_count, parsed_count, chunk_count, embedded_count,
        upserted_count, skipped_unchanged_count, failed_count
      ) VALUES (
        ${run.id}, ${defaultOrgId()}, ${run.startedAt}, ${run.status},
        ${run.triggeredBy}, ${JSON.stringify(run.sourceIds)}::jsonb,
        0, 0, 0, 0, 0, 0, 0
      )
    `;
    return run;
  }

  const all = readJsonArrayFile<KnowledgeSyncRun>(syncRunsFile());
  all.unshift(run);
  writeJsonArrayFile(syncRunsFile(), all.slice(0, 50));
  return run;
}

export async function finishKnowledgeSyncRun(
  run: KnowledgeSyncRun,
  status: KnowledgeSyncRunStatus,
  errorSummary?: string
): Promise<KnowledgeSyncRun> {
  const completed: KnowledgeSyncRun = {
    ...run,
    status,
    completedAt: new Date().toISOString(),
    errorSummary,
  };

  if (isPostgresConfigured()) {
    await pgQuery`
      UPDATE knowledge_sync_runs SET
        completed_at = ${completed.completedAt},
        status = ${completed.status},
        downloaded_count = ${completed.downloadedCount},
        parsed_count = ${completed.parsedCount},
        chunk_count = ${completed.chunkCount},
        embedded_count = ${completed.embeddedCount},
        upserted_count = ${completed.upsertedCount},
        skipped_unchanged_count = ${completed.skippedUnchangedCount},
        failed_count = ${completed.failedCount},
        error_summary = ${completed.errorSummary ?? null}
      WHERE id = ${completed.id} AND org_id = ${defaultOrgId()}
    `;
    return completed;
  }

  const all = readJsonArrayFile<KnowledgeSyncRun>(syncRunsFile());
  const idx = all.findIndex((r) => r.id === completed.id);
  if (idx >= 0) all[idx] = completed;
  writeJsonArrayFile(syncRunsFile(), all);
  return completed;
}

export async function listKnowledgeDocumentStates(): Promise<KnowledgeDocumentState[]> {
  if (isPostgresConfigured()) {
    const rows = await pgQuery`
      SELECT source_id, url, checksum, vector_ids, namespace, last_indexed_at, status, chunk_count
      FROM knowledge_document_states
      WHERE org_id = ${defaultOrgId()}
    `;
    return rows.map(rowToDoc);
  }
  return readJsonArrayFile<KnowledgeDocumentState>(documentStatesFile());
}

export async function getKnowledgeDocumentState(
  sourceId: string
): Promise<KnowledgeDocumentState | null> {
  if (isPostgresConfigured()) {
    const rows = await pgQuery`
      SELECT source_id, url, checksum, vector_ids, namespace, last_indexed_at, status, chunk_count
      FROM knowledge_document_states
      WHERE org_id = ${defaultOrgId()} AND source_id = ${sourceId}
      LIMIT 1
    `;
    return rows[0] ? rowToDoc(rows[0]) : null;
  }
  return (
    readJsonArrayFile<KnowledgeDocumentState>(documentStatesFile()).find(
      (d) => d.sourceId === sourceId
    ) ?? null
  );
}

export async function upsertKnowledgeDocumentState(
  state: KnowledgeDocumentState
): Promise<void> {
  if (isPostgresConfigured()) {
    await pgQuery`
      INSERT INTO knowledge_document_states (
        source_id, org_id, url, checksum, vector_ids, namespace, last_indexed_at, status, chunk_count
      ) VALUES (
        ${state.sourceId}, ${defaultOrgId()}, ${state.url}, ${state.checksum},
        ${JSON.stringify(state.vectorIds)}::jsonb, ${state.namespace},
        ${state.lastIndexedAt}, ${state.status}, ${state.chunkCount}
      )
      ON CONFLICT (org_id, source_id) DO UPDATE SET
        url = EXCLUDED.url,
        checksum = EXCLUDED.checksum,
        vector_ids = EXCLUDED.vector_ids,
        namespace = EXCLUDED.namespace,
        last_indexed_at = EXCLUDED.last_indexed_at,
        status = EXCLUDED.status,
        chunk_count = EXCLUDED.chunk_count
    `;
    return;
  }

  const all = readJsonArrayFile<KnowledgeDocumentState>(documentStatesFile());
  const idx = all.findIndex((d) => d.sourceId === state.sourceId);
  if (idx >= 0) all[idx] = state;
  else all.push(state);
  writeJsonArrayFile(documentStatesFile(), all);
}

export async function markKnowledgeDocumentStale(sourceId: string): Promise<void> {
  const existing = await getKnowledgeDocumentState(sourceId);
  if (!existing) return;
  await upsertKnowledgeDocumentState({ ...existing, status: "stale" });
}

function rowToRun(row: Record<string, unknown>): KnowledgeSyncRun {
  const sourceIds = row.source_ids;
  return {
    id: String(row.id),
    startedAt: new Date(String(row.started_at)).toISOString(),
    completedAt: row.completed_at
      ? new Date(String(row.completed_at)).toISOString()
      : undefined,
    status: String(row.status) as KnowledgeSyncRun["status"],
    triggeredBy: String(row.triggered_by) as KnowledgeSyncRun["triggeredBy"],
    sourceIds: Array.isArray(sourceIds)
      ? (sourceIds as string[])
      : typeof sourceIds === "string"
        ? (JSON.parse(sourceIds) as string[])
        : [],
    downloadedCount: Number(row.downloaded_count ?? 0),
    parsedCount: Number(row.parsed_count ?? 0),
    chunkCount: Number(row.chunk_count ?? 0),
    embeddedCount: Number(row.embedded_count ?? 0),
    upsertedCount: Number(row.upserted_count ?? 0),
    skippedUnchangedCount: Number(row.skipped_unchanged_count ?? 0),
    failedCount: Number(row.failed_count ?? 0),
    errorSummary: row.error_summary != null ? String(row.error_summary) : undefined,
  };
}

function rowToDoc(row: Record<string, unknown>): KnowledgeDocumentState {
  const vectorIds = row.vector_ids;
  return {
    sourceId: String(row.source_id),
    url: String(row.url ?? ""),
    checksum: String(row.checksum),
    vectorIds: Array.isArray(vectorIds)
      ? (vectorIds as string[])
      : typeof vectorIds === "string"
        ? (JSON.parse(vectorIds) as string[])
        : [],
    namespace: String(row.namespace),
    lastIndexedAt: new Date(String(row.last_indexed_at)).toISOString(),
    status: String(row.status) as KnowledgeDocumentState["status"],
    chunkCount: Number(row.chunk_count ?? 0),
  };
}
