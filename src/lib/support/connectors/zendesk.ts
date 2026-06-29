import "server-only";

import type {
  NormalizedIssue,
  TicketConnector,
  TicketConnectorCapabilities,
} from "../types";
import { safeFetch } from "../../ssrf";
import { withRetry } from "../retry";

export class ZendeskConnector implements TicketConnector {
  readonly id = "zendesk";
  readonly isMock = false;
  readonly capabilities: TicketConnectorCapabilities = {
    canComment: true,
    canTransition: false,
    canLink: false,
    canCreate: false,
  };

  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(subdomain: string, email: string, apiToken: string) {
    const host = subdomain.includes(".")
      ? subdomain.replace(/^https?:\/\//, "").replace(/\/$/, "")
      : `${subdomain}.zendesk.com`;
    this.baseUrl = `https://${host}`;
    this.authHeader =
      "Basic " + Buffer.from(`${email}/token:${apiToken}`).toString("base64");
  }

  private headers() {
    return {
      Authorization: this.authHeader,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }

  private normalize(raw: ZendeskTicket, comments: ZendeskComment[] = []): NormalizedIssue {
    const id = String(raw.id);
    return {
      id: `ZD-${id}`,
      source: "zendesk",
      key: `ZD-${id}`,
      title: raw.subject ?? `Zendesk ticket ${id}`,
      body: raw.description ?? "",
      state: raw.status ?? "unknown",
      labels: raw.tags ?? [],
      assignee: raw.assignee_id ? String(raw.assignee_id) : undefined,
      author: raw.requester_id ? String(raw.requester_id) : undefined,
      priority: raw.priority ?? undefined,
      comments: comments.map((c) => ({
        author: c.author_id ? String(c.author_id) : "unknown",
        body: c.plain_body ?? c.body ?? "",
        createdAt: c.created_at?.slice(0, 10),
      })),
      url: `${this.baseUrl}/agent/tickets/${id}`,
      createdAt: raw.created_at?.slice(0, 10),
      updatedAt: raw.updated_at?.slice(0, 10),
    };
  }

  async testConnection(): Promise<{ ok: boolean; detail: string }> {
    try {
      const res = await safeFetch(`${this.baseUrl}/api/v2/users/me.json`, {
        headers: this.headers(),
      });
      if (!res.ok) return { ok: false, detail: `Zendesk returned ${res.status}` };
      const data = JSON.parse(res.text) as { user?: { name?: string; email?: string } };
      return {
        ok: true,
        detail: `Connected as ${data.user?.name ?? data.user?.email ?? "Zendesk user"}`,
      };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : "connection failed" };
    }
  }

  async getIssue(ref: string): Promise<NormalizedIssue | null> {
    const id = ref.replace(/^ZD-/i, "").trim();
    if (!/^\d+$/.test(id)) return null;
    const ticketRes = await withRetry(() =>
      safeFetch(`${this.baseUrl}/api/v2/tickets/${encodeURIComponent(id)}.json`, {
        headers: this.headers(),
      })
    ).catch(() => null);
    if (!ticketRes?.ok) return null;
    const commentsRes = await safeFetch(
      `${this.baseUrl}/api/v2/tickets/${encodeURIComponent(id)}/comments.json`,
      { headers: this.headers() }
    ).catch(() => null);
    const ticket = (JSON.parse(ticketRes.text) as { ticket?: ZendeskTicket }).ticket;
    if (!ticket) return null;
    const comments = commentsRes?.ok
      ? ((JSON.parse(commentsRes.text) as { comments?: ZendeskComment[] }).comments ?? [])
      : [];
    return this.normalize(ticket, comments);
  }

  async searchIssues(query: string, limit = 5): Promise<NormalizedIssue[]> {
    const clean = query.replace(/["\\]/g, " ").trim();
    const direct = clean.match(/^ZD-(\d+)$/i)?.[1] ?? (/^\d+$/.test(clean) ? clean : null);
    if (direct) {
      const issue = await this.getIssue(direct);
      return issue ? [issue] : [];
    }

    const q = encodeURIComponent(`type:ticket ${clean}`);
    const res = await withRetry(() =>
      safeFetch(
        `${this.baseUrl}/api/v2/search.json?query=${q}&per_page=${Math.min(limit, 20)}`,
        { headers: this.headers() }
      )
    ).catch(() => null);
    if (!res?.ok) return [];
    const data = JSON.parse(res.text) as { results?: ZendeskTicket[] };
    return (data.results ?? [])
      .filter((t) => t.result_type === undefined || t.result_type === "ticket")
      .slice(0, limit)
      .map((t) => this.normalize(t));
  }

  async listRecentIssues(limit = 8): Promise<NormalizedIssue[]> {
    const q = encodeURIComponent("type:ticket order_by:updated_at sort:desc");
    const res = await safeFetch(
      `${this.baseUrl}/api/v2/search.json?query=${q}&per_page=${Math.min(limit, 20)}`,
      { headers: this.headers() }
    ).catch(() => null);
    if (!res?.ok) return [];
    const data = JSON.parse(res.text) as { results?: ZendeskTicket[] };
    return (data.results ?? []).slice(0, limit).map((t) => this.normalize(t));
  }

  async addComment(ref: string, body: string) {
    const id = ref.replace(/^ZD-/i, "").trim();
    if (!/^\d+$/.test(id)) throw new Error(`Invalid Zendesk ticket ref: ${ref}`);
    const res = await safeFetch(`${this.baseUrl}/api/v2/tickets/${encodeURIComponent(id)}.json`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify({ ticket: { comment: { body, public: false } } }),
    });
    if (!res.ok) throw new Error(`Zendesk addComment ${res.status}: ${res.text.slice(0, 200)}`);
    return { ok: true, url: `${this.baseUrl}/agent/tickets/${id}` };
  }
}

export class MockZendeskTicketConnector implements TicketConnector {
  readonly id = "zendesk-mock";
  readonly isMock = true;
  readonly capabilities: TicketConnectorCapabilities = {
    canComment: true,
    canTransition: false,
    canLink: false,
    canCreate: false,
  };

  private readonly tickets: NormalizedIssue[] = [
    {
      id: "ZD-1001",
      source: "zendesk",
      key: "ZD-1001",
      title: "Customer cannot sync threat indicators from CTIX",
      body: "Customer reports indicator sync fails after adding a tag filter.",
      state: "open",
      labels: ["ctix", "sync", "tags"],
      priority: "high",
      comments: [{ author: "customer", body: "The failing request ID is req-zd-1001." }],
      url: "https://example.zendesk.com/agent/tickets/1001",
      updatedAt: "2026-06-20",
    },
    {
      id: "ZD-1002",
      source: "zendesk",
      key: "ZD-1002",
      title: "Confluence runbook says to use deprecated CQL operator",
      body: "Support needs the latest docs-backed recommendation for a CQL filter.",
      state: "pending",
      labels: ["cql", "docs"],
      priority: "normal",
      comments: [],
      url: "https://example.zendesk.com/agent/tickets/1002",
      updatedAt: "2026-06-18",
    },
  ];

  async testConnection() {
    return { ok: true, detail: "Mock Zendesk (demo data — set ZENDESK_* to go live)" };
  }

  async getIssue(ref: string): Promise<NormalizedIssue | null> {
    return this.tickets.find((t) => t.id === ref || t.key === ref) ?? null;
  }

  async searchIssues(query: string, limit = 5): Promise<NormalizedIssue[]> {
    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    const scored = this.tickets
      .map((ticket) => ({
        ticket,
        score: terms.filter((t) => `${ticket.title} ${ticket.body}`.toLowerCase().includes(t)).length,
      }))
      .sort((a, b) => b.score - a.score);
    const matched = scored.filter((x) => x.score > 0);
    return (matched.length ? matched : scored).slice(0, limit).map((x) => x.ticket);
  }

  async listRecentIssues(limit = 8): Promise<NormalizedIssue[]> {
    return this.tickets.slice(0, limit);
  }

  async addComment(ref: string, _body: string) {
    return {
      ok: true,
      mock: true,
      url: `https://example.zendesk.com/agent/tickets/${ref.replace(/^ZD-/i, "")}#mock-comment`,
    };
  }
}

interface ZendeskTicket {
  id: number;
  result_type?: string;
  subject?: string;
  description?: string;
  status?: string;
  tags?: string[];
  priority?: string | null;
  requester_id?: number | null;
  assignee_id?: number | null;
  created_at?: string;
  updated_at?: string;
}

interface ZendeskComment {
  author_id?: number;
  body?: string;
  plain_body?: string;
  created_at?: string;
}
