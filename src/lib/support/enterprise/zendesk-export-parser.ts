import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import type { NormalizedIssue } from "../types";

export interface ZendeskExportParseStats {
  ticketFilesFound: number;
  ticketsParsed: number;
  commentsLoaded: number;
  skipped: number;
}

export interface ZendeskExportParseResult {
  tickets: NormalizedIssue[];
  errors: string[];
  stats: ZendeskExportParseStats;
}

interface ZendeskExportTicket {
  id: number | string;
  url?: string;
  subject?: string;
  description?: string;
  status?: string;
  tags?: string[];
  priority?: string | null;
  requester_id?: number | string | null;
  assignee_id?: number | string | null;
  created_at?: string;
  updated_at?: string;
}

interface ZendeskExportComment {
  author_id?: number | string;
  body?: string;
  plain_body?: string;
  created_at?: string;
  public?: boolean;
}

function ticketsDirHasJson(ticketsDir: string): boolean {
  try {
    return readdirSync(ticketsDir).some((name) => name.endsWith(".json"));
  } catch {
    return false;
  }
}

/** Recursively locate a Zendesk export folder containing `tickets/*.json`. */
export function findZendeskExportRoot(baseDir: string): string | null {
  if (!existsSync(baseDir)) return null;

  const ticketsDir = path.join(baseDir, "tickets");
  if (existsSync(ticketsDir) && ticketsDirHasJson(ticketsDir)) {
    return baseDir;
  }

  let entries: string[];
  try {
    entries = readdirSync(baseDir);
  } catch {
    return null;
  }

  for (const name of entries) {
    const full = path.join(baseDir, name);
    try {
      if (!statSync(full).isDirectory()) continue;
    } catch {
      continue;
    }
    const found = findZendeskExportRoot(full);
    if (found) return found;
  }

  return null;
}

function ticketAgentUrl(id: string, raw?: ZendeskExportTicket, agentBaseUrl?: string): string {
  if (agentBaseUrl) {
    return `${agentBaseUrl.replace(/\/$/, "")}/agent/tickets/${id}`;
  }
  if (raw?.url) {
    try {
      const u = new URL(raw.url);
      return `${u.origin}/agent/tickets/${id}`;
    } catch {
      /* fall through */
    }
  }
  return "";
}

function normalizeTicket(
  raw: ZendeskExportTicket,
  comments: ZendeskExportComment[],
  agentBaseUrl?: string
): NormalizedIssue {
  const id = String(raw.id);
  return {
    id: `ZD-${id}`,
    source: "zendesk",
    key: `ZD-${id}`,
    title: raw.subject ?? `Zendesk ticket ${id}`,
    body: raw.description ?? "",
    state: raw.status ?? "unknown",
    labels: raw.tags ?? [],
    assignee: raw.assignee_id != null ? String(raw.assignee_id) : undefined,
    author: raw.requester_id != null ? String(raw.requester_id) : undefined,
    priority: raw.priority ?? undefined,
    comments: comments.map((c) => ({
      author: c.author_id != null ? String(c.author_id) : "unknown",
      body: c.plain_body ?? c.body ?? "",
      createdAt: c.created_at?.slice(0, 10),
    })),
    url: ticketAgentUrl(id, raw, agentBaseUrl),
    createdAt: raw.created_at?.slice(0, 10),
    updatedAt: raw.updated_at?.slice(0, 10),
  };
}

function readCommentsFile(commentsDir: string, ticketId: string): ZendeskExportComment[] {
  const file = path.join(commentsDir, `${ticketId}.json`);
  if (!existsSync(file)) return [];
  try {
    const data = JSON.parse(readFileSync(file, "utf8")) as { comments?: ZendeskExportComment[] };
    return data.comments ?? [];
  } catch {
    return [];
  }
}

export function parseZendeskExportFolder(
  exportRoot: string,
  opts?: { limit?: number; agentBaseUrl?: string }
): ZendeskExportParseResult {
  const ticketsDir = path.join(exportRoot, "tickets");
  const commentsDir = path.join(exportRoot, "comments");
  const errors: string[] = [];
  const tickets: NormalizedIssue[] = [];
  const limit = opts?.limit;

  if (!existsSync(ticketsDir)) {
    return {
      tickets: [],
      errors: [`Missing tickets directory: ${ticketsDir}`],
      stats: { ticketFilesFound: 0, ticketsParsed: 0, commentsLoaded: 0, skipped: 0 },
    };
  }

  let ticketFiles: string[];
  try {
    ticketFiles = readdirSync(ticketsDir)
      .filter((name) => name.endsWith(".json"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  } catch (err) {
    return {
      tickets: [],
      errors: [`Cannot read tickets directory: ${err instanceof Error ? err.message : String(err)}`],
      stats: { ticketFilesFound: 0, ticketsParsed: 0, commentsLoaded: 0, skipped: 0 },
    };
  }

  let commentsLoaded = 0;
  let skipped = 0;

  for (const file of ticketFiles) {
    if (limit != null && tickets.length >= limit) {
      skipped += ticketFiles.length - ticketFiles.indexOf(file);
      break;
    }

    const filePath = path.join(ticketsDir, file);
    let raw: ZendeskExportTicket;
    try {
      raw = JSON.parse(readFileSync(filePath, "utf8")) as ZendeskExportTicket;
    } catch (err) {
      errors.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
      skipped += 1;
      continue;
    }

    if (raw.id == null || raw.id === "") {
      errors.push(`${file}: missing ticket id`);
      skipped += 1;
      continue;
    }

    const ticketId = String(raw.id);
    const comments = existsSync(commentsDir) ? readCommentsFile(commentsDir, ticketId) : [];
    if (comments.length > 0) commentsLoaded += 1;

    tickets.push(normalizeTicket(raw, comments, opts?.agentBaseUrl));
  }

  return {
    tickets,
    errors,
    stats: {
      ticketFilesFound: ticketFiles.length,
      ticketsParsed: tickets.length,
      commentsLoaded,
      skipped,
    },
  };
}
