import "server-only";

import { chunkIssue } from "../chunk";
import { embedBatch } from "../embed";
import { getConfig } from "../config";
import { getVectorStore } from "../vector-store";
import type { SupportChunk } from "../types";
import { checksumForContent } from "@/knowledge/stores/knowledge-sync-store";
import {
  countStoredZendeskTickets,
  upsertZendeskSyncState,
  upsertZendeskTickets,
} from "./stores/zendesk-ticket-store";
import {
  findZendeskExportRoot,
  parseZendeskExportFolder,
  type ZendeskExportParseStats,
} from "./zendesk-export-parser";
import { zendeskTicketNamespace } from "./zendesk-ticket-ingest";

const EMBED_BATCH_SIZE = 50;

export interface ZendeskFolderIngestResult {
  namespace: string;
  exportRoot: string;
  ticketsParsed: number;
  ticketsStored: number;
  chunks: number;
  upserted: number;
  dryRun: boolean;
  errors: string[];
  stats: ZendeskExportParseStats;
  usedMockStore: boolean;
  usedOpenAI: boolean;
  checksum: string;
  sampleTitles: string[];
}

function defaultImportDir(): string {
  return process.env.ZENDESK_IMPORT_DIR?.trim() || ".data/imports/zendesk";
}

function agentBaseUrlFromConfig(): string | undefined {
  const subdomain = getConfig().zendesk.subdomain;
  if (!subdomain) return undefined;
  const host = subdomain.includes(".")
    ? subdomain.replace(/^https?:\/\//, "").replace(/\/$/, "")
    : `${subdomain}.zendesk.com`;
  return `https://${host}`;
}

function defaultRepoRef() {
  return { owner: "zendesk", name: "tickets", branch: "imported" };
}

export async function ingestZendeskTicketsFromFolder(input?: {
  dir?: string;
  force?: boolean;
  dryRun?: boolean;
  limit?: number;
}): Promise<ZendeskFolderIngestResult> {
  const baseDir = input?.dir?.trim() || defaultImportDir();
  const dryRun = Boolean(input?.dryRun);
  const force = Boolean(input?.force);
  const namespace = zendeskTicketNamespace();

  const exportRoot = findZendeskExportRoot(baseDir);
  if (!exportRoot) {
    throw new Error(`No Zendesk export folder (tickets/*.json) found under ${baseDir}`);
  }

  const parsed = parseZendeskExportFolder(exportRoot, {
    limit: input?.limit,
    agentBaseUrl: agentBaseUrlFromConfig(),
  });

  const sampleTitles = parsed.tickets.slice(0, 5).map((t) => t.title);
  const checksum = checksumForContent(
    parsed.tickets.map((t) => `${t.id}:${t.updatedAt}:${t.title}`).join("\n")
  );

  if (dryRun) {
    return {
      namespace,
      exportRoot,
      ticketsParsed: parsed.tickets.length,
      ticketsStored: 0,
      chunks: parsed.tickets.length,
      upserted: 0,
      dryRun: true,
      errors: parsed.errors,
      stats: parsed.stats,
      usedMockStore: false,
      usedOpenAI: false,
      checksum,
      sampleTitles,
    };
  }

  const stored = await upsertZendeskTickets(parsed.tickets);
  const ref = defaultRepoRef();
  const chunks: SupportChunk[] = parsed.tickets.map((t) => chunkIssue(t, ref));

  const store = getVectorStore();
  if (force) {
    await store.deleteNamespace(namespace);
  }

  let upserted = 0;
  let usedOpenAI = false;
  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
    const { vectors, usedOpenAI: used } = await embedBatch(batch.map((c) => c.text));
    usedOpenAI = usedOpenAI || used;
    batch.forEach((c, j) => {
      c.embedding = vectors[j];
    });
    upserted += await store.upsert(namespace, batch);
  }

  const syncedAt = new Date().toISOString();
  await upsertZendeskSyncState({
    lastSyncedAt: syncedAt,
    ticketCount: await countStoredZendeskTickets(),
  });

  return {
    namespace,
    exportRoot,
    ticketsParsed: parsed.tickets.length,
    ticketsStored: stored,
    chunks: chunks.length,
    upserted,
    dryRun: false,
    errors: parsed.errors,
    stats: parsed.stats,
    usedMockStore: store.isMock,
    usedOpenAI,
    checksum,
    sampleTitles,
  };
}
