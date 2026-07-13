import type { CywareProductId } from "@/lib/support/cyware-products";

export type KnowledgeProduct =
  | CywareProductId
  | "cql"
  | "confluence"
  | "support_docs"
  | "zendesk";

export type KnowledgeSourceType =
  | "url"
  | "sitemap"
  | "openapi"
  | "markdown"
  | "confluence"
  | "github"
  | "manual"
  | "zendesk";

export interface KnowledgeSourceConfig {
  id: string;
  name: string;
  product: KnowledgeProduct;
  type: KnowledgeSourceType;
  url?: string;
  enabled: boolean;
  syncIntervalHours: number;
  lastSyncedAt?: string;
  lastSyncStatus?: KnowledgeSyncRunStatus;
}

export type KnowledgeSyncRunStatus = "running" | "completed" | "failed" | "partial";

export interface KnowledgeSyncRun {
  id: string;
  startedAt: string;
  completedAt?: string;
  status: KnowledgeSyncRunStatus;
  triggeredBy: "manual" | "scheduled" | "startup";
  sourceIds: string[];
  downloadedCount: number;
  parsedCount: number;
  chunkCount: number;
  embeddedCount: number;
  upsertedCount: number;
  skippedUnchangedCount: number;
  failedCount: number;
  errorSummary?: string;
}

export interface KnowledgeDocumentState {
  sourceId: string;
  url: string;
  checksum: string;
  vectorIds: string[];
  namespace: string;
  lastIndexedAt: string;
  status: "active" | "stale" | "failed";
  chunkCount: number;
}

export interface KnowledgeSyncSourceResult {
  sourceId: string;
  ok: boolean;
  skipped: boolean;
  chunks: number;
  checksum?: string;
  namespace?: string;
  error?: string;
  warnings: string[];
}

export interface KnowledgeSyncResult {
  run: KnowledgeSyncRun;
  sources: KnowledgeSyncSourceResult[];
}
