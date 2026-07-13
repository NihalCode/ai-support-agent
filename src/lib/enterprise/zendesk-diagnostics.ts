import "server-only";

import { performance } from "node:perf_hooks";

import { isPostgresConfigured } from "@/lib/db/postgres";
import { defaultOrgId } from "@/lib/support/enterprise/file-store";
import {
  getZendeskConnectorStatus,
  type ZendeskConnectorStatus,
} from "@/lib/support/enterprise/zendesk-readiness";
import { searchZendeskForAgent } from "@/lib/support/enterprise/zendesk-search";

export interface ZendeskDiagnostics {
  status: Omit<ZendeskConnectorStatus, "accountSubdomain"> & {
    accountSubdomain?: string;
    lagSeconds: number | null;
    freshness: "current" | "stale" | "unknown";
  };
  stages: Array<{
    id: "connection" | "storage" | "index";
    label: string;
    state: "complete" | "pending" | "blocked";
  }>;
  operations: {
    incrementalSync: { available: boolean; reason?: string };
    fullSync: { available: false; reason: string };
    rebuildIndex: { available: false; reason: string };
    testSearch: { available: true };
  };
}

export async function buildZendeskDiagnostics(
  organizationId: string,
  includeSensitiveMetadata: boolean
): Promise<ZendeskDiagnostics> {
  const connector = await getZendeskConnectorStatus(organizationId);
  const newestSource = connector.newestSourceRecordAt
    ? Date.parse(connector.newestSourceRecordAt)
    : Number.NaN;
  const newestIndex = connector.newestIndexedRecordAt
    ? Date.parse(connector.newestIndexedRecordAt)
    : Number.NaN;
  const lagSeconds =
    Number.isFinite(newestSource) && Number.isFinite(newestIndex)
      ? Math.max(0, Math.round((newestSource - newestIndex) / 1000))
      : null;
  const incrementalAvailable =
    connector.enabled &&
    connector.authorized &&
    (isPostgresConfigured() || organizationId === defaultOrgId());

  const status: ZendeskDiagnostics["status"] = {
    ...connector,
    lagSeconds,
    freshness:
      connector.syncState === "stale"
        ? "stale"
        : connector.lastSuccessfulSyncAt
          ? "current"
          : "unknown",
  };
  if (!includeSensitiveMetadata) delete status.accountSubdomain;

  return {
    status,
    stages: [
      {
        id: "connection",
        label: "Connection and authorization",
        state: connector.connected && connector.authorized ? "complete" : "blocked",
      },
      {
        id: "storage",
        label: "Ticket and comment storage",
        state: connector.ticketsStored > 0 ? "complete" : "pending",
      },
      {
        id: "index",
        label: "Search indexing",
        state:
          connector.ticketsIndexed > 0
            ? connector.ticketsIndexed >= connector.ticketsStored
              ? "complete"
              : "pending"
            : connector.ticketsStored > 0
              ? "blocked"
              : "pending",
      },
    ],
    operations: {
      incrementalSync: {
        available: incrementalAvailable,
        reason: incrementalAvailable
          ? undefined
          : !connector.enabled
            ? "Zendesk synchronization is disabled."
            : !connector.authorized
              ? "Zendesk must be connected and authorized first."
              : "Durable tenant-scoped storage is required for this organization.",
      },
      fullSync: {
        available: false,
        reason:
          "Full synchronization is unavailable until a durable job runner, distributed lock, and resumable checkpoint are configured.",
      },
      rebuildIndex: {
        available: false,
        reason:
          "Index rebuild is unavailable until a durable job runner and rollback-safe index swap are configured.",
      },
      testSearch: { available: true },
    },
  };
}

export async function runSanitizedZendeskTestSearch(
  organizationId: string,
  query: string,
  traceId: string
) {
  const started = performance.now();
  const result = await searchZendeskForAgent(query, 10, undefined, organizationId);
  return {
    resultCount: result.tickets.length,
    indexedResultCount: result.fromIndex ? result.tickets.length : 0,
    usedLiveSearch: result.fromLive,
    durationMs: Math.max(0, Math.round(performance.now() - started)),
    traceId,
  };
}
