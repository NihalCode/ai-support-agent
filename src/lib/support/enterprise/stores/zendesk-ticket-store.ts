import "server-only";

import { pgQuery, isPostgresConfigured } from "@/lib/db/postgres";
import type { NormalizedIssue } from "../../types";
import {
  defaultOrgId,
  enterpriseDataDir,
  readJsonArrayFile,
  readJsonFile,
  writeJsonFile,
} from "../file-store";

export interface StoredZendeskTicket {
  ticketId: string;
  subject: string;
  description: string;
  status: string;
  priority?: string;
  tags: string[];
  requesterId?: string;
  assigneeId?: string;
  comments: NormalizedIssue["comments"];
  url?: string;
  createdAt?: string;
  updatedAt?: string;
  syncedAt: string;
}

export interface ZendeskSyncState {
  lastSyncedAt?: string;
  lastStartTime?: number;
  ticketCount: number;
  updatedAt: string;
}

function ticketsFile(): string {
  return `${enterpriseDataDir("zendesk")}/tickets.json`;
}

function syncStateFile(): string {
  return `${enterpriseDataDir("zendesk")}/sync-state.json`;
}

function rowToTicket(row: Record<string, unknown>): StoredZendeskTicket {
  return {
    ticketId: String(row.ticket_id),
    subject: String(row.subject ?? ""),
    description: String(row.description ?? ""),
    status: String(row.status ?? "unknown"),
    priority: row.priority ? String(row.priority) : undefined,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    requesterId: row.requester_id ? String(row.requester_id) : undefined,
    assigneeId: row.assignee_id ? String(row.assignee_id) : undefined,
    comments: Array.isArray(row.comments_json)
      ? (row.comments_json as StoredZendeskTicket["comments"])
      : [],
    url: row.url ? String(row.url) : undefined,
    createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : undefined,
    syncedAt: new Date(String(row.synced_at)).toISOString(),
  };
}

export function storedTicketToNormalized(t: StoredZendeskTicket): NormalizedIssue {
  const key = t.ticketId.startsWith("ZD-") ? t.ticketId : `ZD-${t.ticketId}`;
  return {
    id: key,
    source: "zendesk",
    key,
    title: t.subject,
    body: t.description,
    state: t.status,
    labels: t.tags,
    assignee: t.assigneeId,
    author: t.requesterId,
    priority: t.priority,
    comments: t.comments,
    url: t.url ?? "",
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

export async function upsertZendeskTickets(
  tickets: NormalizedIssue[],
  organizationId = defaultOrgId()
): Promise<number> {
  if (tickets.length === 0) return 0;
  const orgId = organizationId;
  const now = new Date().toISOString();

  if (isPostgresConfigured()) {
    for (const ticket of tickets) {
      const ticketId = ticket.key?.replace(/^ZD-/i, "") ?? ticket.id.replace(/^ZD-/i, "");
      await pgQuery`
        INSERT INTO zendesk_tickets (
          org_id, ticket_id, subject, description, status, priority, tags,
          requester_id, assignee_id, comments_json, url, created_at, updated_at, synced_at
        ) VALUES (
          ${orgId},
          ${ticketId},
          ${ticket.title},
          ${ticket.body ?? ""},
          ${ticket.state ?? "unknown"},
          ${ticket.priority ?? null},
          ${JSON.stringify(ticket.labels ?? [])},
          ${ticket.author ?? null},
          ${ticket.assignee ?? null},
          ${JSON.stringify(ticket.comments ?? [])},
          ${ticket.url ?? null},
          ${ticket.createdAt ? new Date(ticket.createdAt) : null},
          ${ticket.updatedAt ? new Date(ticket.updatedAt) : null},
          ${now}
        )
        ON CONFLICT (org_id, ticket_id) DO UPDATE SET
          subject = EXCLUDED.subject,
          description = EXCLUDED.description,
          status = EXCLUDED.status,
          priority = EXCLUDED.priority,
          tags = EXCLUDED.tags,
          requester_id = EXCLUDED.requester_id,
          assignee_id = EXCLUDED.assignee_id,
          comments_json = EXCLUDED.comments_json,
          url = EXCLUDED.url,
          updated_at = EXCLUDED.updated_at,
          synced_at = EXCLUDED.synced_at
      `;
    }
    return tickets.length;
  }

  if (orgId !== defaultOrgId()) {
    throw new Error("Durable tenant-scoped Zendesk storage is required");
  }
  const existing = readJsonArrayFile<StoredZendeskTicket>(ticketsFile());
  const byId = new Map(existing.map((t) => [t.ticketId, t]));
  for (const ticket of tickets) {
    const ticketId = ticket.key?.replace(/^ZD-/i, "") ?? ticket.id.replace(/^ZD-/i, "");
    byId.set(ticketId, {
      ticketId,
      subject: ticket.title,
      description: ticket.body ?? "",
      status: ticket.state ?? "unknown",
      priority: ticket.priority,
      tags: ticket.labels ?? [],
      requesterId: ticket.author,
      assigneeId: ticket.assignee,
      comments: ticket.comments ?? [],
      url: ticket.url,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      syncedAt: now,
    });
  }
  writeJsonFile(ticketsFile(), [...byId.values()]);
  return tickets.length;
}

export async function listStoredZendeskTickets(
  limit = 500,
  organizationId = defaultOrgId()
): Promise<StoredZendeskTicket[]> {
  const orgId = organizationId;
  if (isPostgresConfigured()) {
    const rows = await pgQuery`
      SELECT * FROM zendesk_tickets
      WHERE org_id = ${orgId}
      ORDER BY updated_at DESC NULLS LAST
      LIMIT ${limit}
    `;
    return rows.map((r) => rowToTicket(r as Record<string, unknown>));
  }
  if (orgId !== defaultOrgId()) return [];
  return readJsonArrayFile<StoredZendeskTicket>(ticketsFile()).slice(0, limit);
}

export async function searchStoredZendeskTickets(
  query: string,
  limit = 10,
  organizationId = defaultOrgId()
): Promise<NormalizedIssue[]> {
  const terms = [...new Set(query
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter((t) => t.length > 2))];
  const direct = query.match(/ZD-(\d+)/i)?.[1];
  // Do not silently exclude older history. The current production export is
  // larger than 2,000 records, and historical research must scan all mirrored
  // tickets until native Postgres FTS is introduced.
  const all = await listStoredZendeskTickets(50_000, organizationId);
  const scored = all
    .map((ticket) => {
      if (direct && ticket.ticketId === direct) return { ticket, score: 100 };
      const subject = ticket.subject.toLowerCase();
      const description = ticket.description.toLowerCase();
      const tags = ticket.tags.join(" ").toLowerCase();
      const comments = ticket.comments.map((comment) => comment.body).join(" ").toLowerCase();
      const score = terms.reduce((total, term) => {
        if (subject.includes(term)) total += 6;
        if (tags.includes(term)) total += 4;
        if (description.includes(term)) total += 2;
        if (comments.includes(term)) total += 1;
        return total;
      }, 0);
      return { ticket, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => storedTicketToNormalized(x.ticket));
}

export async function getStoredZendeskTicket(
  ticketId: string,
  organizationId = defaultOrgId()
): Promise<NormalizedIssue | null> {
  const id = ticketId.replace(/^ZD-/i, "");
  const orgId = organizationId;
  if (isPostgresConfigured()) {
    const rows = await pgQuery`
      SELECT * FROM zendesk_tickets
      WHERE org_id = ${orgId} AND ticket_id = ${id}
      LIMIT 1
    `;
    return rows[0] ? storedTicketToNormalized(rowToTicket(rows[0] as Record<string, unknown>)) : null;
  }
  if (orgId !== defaultOrgId()) return null;
  const found = readJsonArrayFile<StoredZendeskTicket>(ticketsFile()).find((t) => t.ticketId === id);
  return found ? storedTicketToNormalized(found) : null;
}

export async function getZendeskSyncState(
  organizationId = defaultOrgId()
): Promise<ZendeskSyncState | null> {
  const orgId = organizationId;
  if (isPostgresConfigured()) {
    const rows = await pgQuery`
      SELECT * FROM zendesk_sync_state WHERE org_id = ${orgId} LIMIT 1
    `;
    if (!rows[0]) return null;
    const row = rows[0] as Record<string, unknown>;
    return {
      lastSyncedAt: row.last_synced_at
        ? new Date(String(row.last_synced_at)).toISOString()
        : undefined,
      lastStartTime: row.last_start_time != null ? Number(row.last_start_time) : undefined,
      ticketCount: Number(row.ticket_count ?? 0),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
    };
  }
  if (orgId !== defaultOrgId()) return null;
  return readJsonFile<ZendeskSyncState | null>(syncStateFile(), null);
}

export async function upsertZendeskSyncState(
  state: Partial<ZendeskSyncState>,
  organizationId = defaultOrgId()
): Promise<ZendeskSyncState> {
  const orgId = organizationId;
  const now = new Date().toISOString();
  const prev = (await getZendeskSyncState(orgId)) ?? {
    ticketCount: 0,
    updatedAt: now,
  };
  const next: ZendeskSyncState = {
    lastSyncedAt: state.lastSyncedAt ?? prev.lastSyncedAt,
    lastStartTime: state.lastStartTime ?? prev.lastStartTime,
    ticketCount: state.ticketCount ?? prev.ticketCount,
    updatedAt: now,
  };

  if (isPostgresConfigured()) {
    await pgQuery`
      INSERT INTO zendesk_sync_state (org_id, last_synced_at, last_start_time, ticket_count, updated_at)
      VALUES (
        ${orgId},
        ${next.lastSyncedAt ? new Date(next.lastSyncedAt) : null},
        ${next.lastStartTime ?? null},
        ${next.ticketCount},
        ${now}
      )
      ON CONFLICT (org_id) DO UPDATE SET
        last_synced_at = EXCLUDED.last_synced_at,
        last_start_time = EXCLUDED.last_start_time,
        ticket_count = EXCLUDED.ticket_count,
        updated_at = EXCLUDED.updated_at
    `;
    return next;
  }

  if (orgId !== defaultOrgId()) {
    throw new Error("Durable tenant-scoped Zendesk storage is required");
  }
  writeJsonFile(syncStateFile(), next);
  return next;
}

export async function countStoredZendeskTickets(
  organizationId = defaultOrgId()
): Promise<number> {
  const orgId = organizationId;
  if (isPostgresConfigured()) {
    const rows = await pgQuery`
      SELECT COUNT(*)::int AS c FROM zendesk_tickets WHERE org_id = ${orgId}
    `;
    return Number((rows[0] as { c?: number })?.c ?? 0);
  }
  if (orgId !== defaultOrgId()) return 0;
  return readJsonArrayFile<StoredZendeskTicket>(ticketsFile()).length;
}

/** Search ingested tickets first, then fall back to live Zendesk API. */
export async function searchZendeskTicketsHybrid(
  query: string,
  limit = 10,
  liveSearch?: (query: string, limit: number) => Promise<NormalizedIssue[]>
): Promise<NormalizedIssue[]> {
  const local = await searchStoredZendeskTickets(query, limit);
  if (local.length >= limit || !liveSearch) return local.slice(0, limit);
  const live = await liveSearch(query, limit);
  const seen = new Set(local.map((t) => t.id));
  const merged = [...local];
  for (const ticket of live) {
    if (!seen.has(ticket.id)) merged.push(ticket);
  }
  return merged.slice(0, limit);
}
