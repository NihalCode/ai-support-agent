/** Shared parsers — keep IDE panels aligned with /api/support/* response shapes. */

import type { McpServerStatus, McpToolDescriptor, NormalizedIssue } from "./types";

export const JIRA_ISSUE_KEY = /^[A-Z][A-Z0-9]+-\d+$/;

export type TicketListItem = { key?: string; title?: string };

export function ticketFromIssue(issue: NormalizedIssue): TicketListItem {
  return { key: issue.key ?? issue.id, title: issue.title };
}

/** GET /api/support/tickets?ref=PROJ-1 */
export function parseTicketRefResponse(data: unknown): {
  ticket: TicketListItem | null;
  mock: boolean;
  issue: NormalizedIssue | null;
} {
  const d = data as { issue?: NormalizedIssue; mock?: boolean; error?: string };
  if (!d?.issue) return { ticket: null, mock: Boolean(d?.mock), issue: null };
  return { ticket: ticketFromIssue(d.issue), mock: Boolean(d.mock), issue: d.issue };
}

/** GET /api/support/tickets?q=... */
export function parseTicketsSearchResponse(data: unknown): {
  tickets: TicketListItem[];
  mock: boolean;
} {
  const d = data as { jira?: { issues?: NormalizedIssue[]; mock?: boolean }; tickets?: TicketListItem[] };
  // Legacy/wrong shape guard — never use top-level `tickets` from API (it does not exist).
  const issues = d?.jira?.issues ?? [];
  return {
    tickets: issues.map(ticketFromIssue),
    mock: Boolean(d?.jira?.mock),
  };
}

/** GET /api/support/mcp */
export function parseMcpDiscoveryResponse(data: unknown): {
  statuses: McpServerStatus[];
  tools: McpToolDescriptor[];
  note: string;
} {
  const d = data as { statuses?: McpServerStatus[]; tools?: McpToolDescriptor[]; error?: string };
  const statuses = d?.statuses ?? [];
  const tools = d?.tools ?? [];
  const connected = statuses.filter((s) => s.connected).length;
  const note =
    d?.error ??
    (statuses.length === 0
      ? "No MCP servers configured. Set MCP_SERVER_CONFIG_JSON or use .cursor/mcp.json locally."
      : `${connected}/${statuses.length} server(s) connected · ${tools.length} tool(s)`);
  return { statuses, tools, note };
}

/** POST /api/support/search */
export function parseWorkspaceSearchResponse(data: unknown): {
  results: unknown[];
  degradedReason?: string;
  error?: string;
} {
  const d = data as { results?: unknown[]; degradedReason?: string; error?: string };
  return {
    results: d?.results ?? [],
    degradedReason: d?.degradedReason,
    error: d?.error,
  };
}

/** GET /api/support/investigations */
export function parseInvestigationsListResponse(data: unknown): {
  investigations: { id: string; title: string; status?: string }[];
} {
  const d = data as { investigations?: { id: string; title: string; status?: string }[] };
  return { investigations: d?.investigations ?? [] };
}

/** GET /api/support/api-import */
export function parseApiImportListResponse(data: unknown): {
  specs: { id: string; name: string; endpoints: number; sourceKind?: string }[];
} {
  const d = data as { specs?: { id: string; name: string; endpoints: number; sourceKind?: string }[] };
  return { specs: d?.specs ?? [] };
}
