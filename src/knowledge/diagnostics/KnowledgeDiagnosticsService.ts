import "server-only";

import { hasOpenAI, hasPinecone } from "@/lib/support/config";

import { listKnowledgeSources } from "../sources/SourceRegistry";
import {
  listKnowledgeDocumentStates,
  listKnowledgeSyncRuns,
} from "../stores/knowledge-sync-store";

export interface KnowledgeDiagnostics {
  vectorDbConfigured: boolean;
  embeddingConfigured: boolean;
  sourceCount: number;
  enabledSourceCount: number;
  lastSyncStatus: string | null;
  lastSyncAt: string | null;
  indexedDocumentCount: number;
  indexedChunkCount: number;
  staleDocumentCount: number;
  failedSourceCount: number;
}

function envConfigured(key: string): boolean {
  return Boolean(process.env[key]?.trim());
}

/** Safe knowledge pipeline diagnostics — no secrets in the response. */
export async function getKnowledgeDiagnostics(): Promise<KnowledgeDiagnostics> {
  const sources = listKnowledgeSources();
  const enabled = sources.filter((s) => s.enabled);
  const [runs, documentStates] = await Promise.all([
    listKnowledgeSyncRuns(1),
    listKnowledgeDocumentStates(),
  ]);

  const lastRun = runs[0];
  const activeDocs = documentStates.filter((d) => d.status === "active");
  const staleDocs = documentStates.filter((d) => d.status === "stale");
  const failedDocs = documentStates.filter((d) => d.status === "failed");

  return {
    vectorDbConfigured: hasPinecone() || envConfigured("PINECONE_API_KEY"),
    embeddingConfigured: hasOpenAI() || envConfigured("OPENAI_API_KEY"),
    sourceCount: sources.length,
    enabledSourceCount: enabled.length,
    lastSyncStatus: lastRun?.status ?? null,
    lastSyncAt: lastRun?.completedAt ?? lastRun?.startedAt ?? null,
    indexedDocumentCount: activeDocs.length,
    indexedChunkCount: activeDocs.reduce((sum, d) => sum + d.chunkCount, 0),
    staleDocumentCount: staleDocs.length,
    failedSourceCount: lastRun?.failedCount ?? failedDocs.length,
  };
}
