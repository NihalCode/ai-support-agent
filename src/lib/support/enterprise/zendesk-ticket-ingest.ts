import "server-only";

import { getZendeskTickets } from "../connectors";
import { chunkIssue } from "../chunk";
import { embedBatch } from "../embed";
import { getConfig } from "../config";
import { getVectorStore } from "../vector-store";
import type { SupportChunk } from "../types";
import { checksumForContent } from "@/knowledge/stores/knowledge-sync-store";
import {
  countStoredZendeskTickets,
  getZendeskSyncState,
  upsertZendeskSyncState,
  upsertZendeskTickets,
} from "./stores/zendesk-ticket-store";

export function zendeskTicketNamespace(): string {
  const base = getConfig().pinecone.namespace;
  return (base ? `${base}__` : "") + "zendesk";
}

export interface ZendeskTicketIngestResult {
  namespace: string;
  ticketsFetched: number;
  ticketsStored: number;
  chunks: number;
  upserted: number;
  skipped: boolean;
  checksum: string;
  usedMockStore: boolean;
  usedOpenAI: boolean;
  warnings: string[];
}

function defaultRepoRef() {
  return { owner: "zendesk", name: "tickets", branch: "synced" };
}

export async function zendeskContentChecksum(): Promise<string> {
  const count = await countStoredZendeskTickets();
  const state = await getZendeskSyncState();
  return checksumForContent(`${count}:${state?.lastSyncedAt ?? ""}:${state?.lastStartTime ?? 0}`);
}

export async function ingestZendeskTickets(input?: {
  force?: boolean;
  maxTickets?: number;
}): Promise<ZendeskTicketIngestResult> {
  const warnings: string[] = [];
  const maxTickets = input?.maxTickets ?? Number.parseInt(process.env.ZENDESK_SYNC_MAX_TICKETS?.trim() || "500", 10);
  const force = Boolean(input?.force);
  const namespace = zendeskTicketNamespace();

  const { connector, mock } = await getZendeskTickets();
  const syncState = await getZendeskSyncState();
  const startTime = force ? 0 : syncState?.lastStartTime ?? 0;

  let tickets = [];
  let endTime: number | undefined;
  if (connector.listTicketsForSync) {
    const batch = await connector.listTicketsForSync(maxTickets, startTime);
    tickets = batch.tickets;
    endTime = batch.endTime;
  } else {
    const recent = await connector.listRecentIssues?.(maxTickets);
    tickets = recent ?? [];
    for (let i = 0; i < tickets.length; i++) {
      const full = await connector.getIssue(tickets[i]!.id);
      if (full) tickets[i] = full;
    }
    endTime = Math.floor(Date.now() / 1000);
  }

  if (mock) {
    warnings.push("Zendesk mock mode — set ZENDESK_* env vars for live company tickets.");
  }

  const stored = await upsertZendeskTickets(tickets);
  const ref = defaultRepoRef();
  const chunks: SupportChunk[] = tickets.map((t) => chunkIssue(t, ref));

  const store = getVectorStore();
  if (force) {
    await store.deleteNamespace(namespace);
  }

  let upserted = 0;
  let usedOpenAI = false;
  if (chunks.length > 0) {
    const { vectors, usedOpenAI: used } = await embedBatch(chunks.map((c) => c.text));
    usedOpenAI = used;
    chunks.forEach((c, i) => (c.embedding = vectors[i]));
    upserted = await store.upsert(namespace, chunks);
  }

  const syncedAt = new Date().toISOString();
  await upsertZendeskSyncState({
    lastSyncedAt: syncedAt,
    lastStartTime: endTime ?? syncState?.lastStartTime,
    ticketCount: await countStoredZendeskTickets(),
  });

  const checksum = checksumForContent(
    tickets.map((t) => `${t.id}:${t.updatedAt}:${t.title}`).join("\n")
  );

  return {
    namespace,
    ticketsFetched: tickets.length,
    ticketsStored: stored,
    chunks: chunks.length,
    upserted,
    skipped: false,
    checksum,
    usedMockStore: store.isMock,
    usedOpenAI,
    warnings,
  };
}
