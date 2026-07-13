import "server-only";

import { getConfig } from "../config";
import { getVectorStore } from "../vector-store";
import { defaultOrgId } from "./file-store";
import {
  countStoredZendeskTickets,
  getZendeskSyncState,
  listStoredZendeskTickets,
} from "./stores/zendesk-ticket-store";
import { zendeskTicketNamespace } from "./zendesk-ticket-ingest";

export type ZendeskSyncReadiness =
  | "never_synced"
  | "queued"
  | "syncing"
  | "ready"
  | "stale"
  | "partial"
  | "failed"
  | "disabled";

export interface ZendeskConnectorStatus {
  connected: boolean;
  authorized: boolean;
  enabled: boolean;
  tenantId: string;
  organizationId: string;
  integrationId: string;
  accountSubdomain?: string;
  syncState: ZendeskSyncReadiness;
  lastSuccessfulSyncAt?: string;
  lastIndexedAt?: string;
  ticketsDiscovered: number;
  ticketsStored: number;
  ticketsIndexed: number;
  commentsIndexed: number;
  newestSourceRecordAt?: string;
  newestIndexedRecordAt?: string;
  lastErrorCode?: string;
  sanitizedLastError?: string;
}

const STALE_AFTER_MS = Number(process.env.ZENDESK_STALE_AFTER_HOURS ?? "24") * 60 * 60 * 1000;

export async function getZendeskConnectorStatus(
  organizationId = defaultOrgId()
): Promise<ZendeskConnectorStatus> {
  const cfg = getConfig();
  const enabled = process.env.KNOWLEDGE_SOURCE_ZENDESK_ENABLED !== "false";
  const integrationId = `zendesk:${organizationId}`;
  const state = await getZendeskSyncState(organizationId);
  const ticketsStored = await countStoredZendeskTickets(organizationId);
  const recent =
    ticketsStored > 0
      ? await listStoredZendeskTickets(Math.min(ticketsStored, 10_000), organizationId)
      : [];
  const commentsIndexed = recent.reduce((total, ticket) => total + ticket.comments.length, 0);
  const newestSourceRecordAt = recent
    .map((ticket) => ticket.updatedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  let ticketsIndexed = 0;
  let indexError: string | undefined;
  try {
    const namespace = zendeskTicketNamespace(organizationId);
    ticketsIndexed =
      (await getVectorStore().listNamespaces()).find((row) => row.namespace === namespace)
        ?.vectorCount ?? 0;
  } catch {
    indexError = "INDEX_UNAVAILABLE";
  }

  const hasApiCredentials = Boolean(
    cfg.zendesk.subdomain && cfg.zendesk.email && cfg.zendesk.apiToken
  );
  const connected = hasApiCredentials || ticketsStored > 0;
  const authorized = hasApiCredentials || (ticketsStored > 0 && ticketsIndexed > 0);
  const lastSyncMs = state?.lastSyncedAt ? Date.parse(state.lastSyncedAt) : 0;
  const stale = lastSyncMs > 0 && Date.now() - lastSyncMs > STALE_AFTER_MS;

  let syncState: ZendeskSyncReadiness;
  if (!enabled) syncState = "disabled";
  else if (indexError && ticketsStored > 0) syncState = "failed";
  else if (ticketsStored === 0) syncState = "never_synced";
  else if (ticketsIndexed === 0 || ticketsIndexed < ticketsStored) syncState = "partial";
  else if (stale) syncState = "stale";
  else syncState = "ready";

  return {
    connected,
    authorized,
    enabled,
    tenantId: organizationId,
    organizationId,
    integrationId,
    accountSubdomain: cfg.zendesk.subdomain || undefined,
    syncState,
    lastSuccessfulSyncAt: state?.lastSyncedAt,
    lastIndexedAt: state?.lastSyncedAt && ticketsIndexed > 0 ? state.lastSyncedAt : undefined,
    ticketsDiscovered: state?.ticketCount ?? ticketsStored,
    ticketsStored,
    ticketsIndexed,
    commentsIndexed,
    newestSourceRecordAt,
    newestIndexedRecordAt: newestSourceRecordAt && ticketsIndexed > 0 ? newestSourceRecordAt : undefined,
    lastErrorCode: indexError,
    sanitizedLastError: indexError ? "Zendesk search index is unavailable." : undefined,
  };
}
