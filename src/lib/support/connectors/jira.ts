import "server-only";

import type {
  TicketConnector,
  TicketConnectorCapabilities,
  NormalizedIssue,
  JiraCreateDraft,
} from "../types";
import { safeFetch } from "../../ssrf";
import { withRetry } from "../retry";

/**
 * Production Jira Cloud connector (REST API v3) using basic auth
 * (email + API token). The base URL is operator-supplied, so all calls go
 * through safeFetch's SSRF guard. Read methods are unrestricted; write methods
 * (comment/transition/link/create) are only invoked by the approval-gated
 * executor.
 */

export class JiraConnector implements TicketConnector {
  readonly id = "jira";
  readonly isMock = false;
  readonly capabilities: TicketConnectorCapabilities = {
    canComment: true,
    canTransition: true,
    canLink: true,
    canCreate: true,
  };
  private baseUrl: string;
  private authHeader: string;
  private projectKey: string | null;

  constructor(baseUrl: string, email: string, apiToken: string, projectKey: string | null = null) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.authHeader = "Basic " + Buffer.from(`${email}:${apiToken}`).toString("base64");
    this.projectKey = projectKey;
  }

  private headers() {
    return {
      Authorization: this.authHeader,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }

  private adfToText(adf: unknown): string {
    if (!adf || typeof adf !== "object") return typeof adf === "string" ? adf : "";
    const node = adf as { text?: string; content?: unknown[] };
    if (node.text) return node.text;
    if (Array.isArray(node.content)) return node.content.map((c) => this.adfToText(c)).join(" ");
    return "";
  }

  /** Wrap plain text into a minimal Atlassian Document Format doc. */
  private textToAdf(text: string) {
    return {
      type: "doc",
      version: 1,
      content: text
        .split(/\n{2,}/)
        .map((para) => ({
          type: "paragraph",
          content: [{ type: "text", text: para || " " }],
        })),
    };
  }

  private normalize(raw: JiraIssue): NormalizedIssue {
    const f = raw.fields;
    const linkedIssues = (f.issuelinks ?? []).map((l) => {
      const other = l.inwardIssue ?? l.outwardIssue;
      const type = l.inwardIssue ? l.type?.inward : l.type?.outward;
      return {
        key: other?.key ?? "",
        type: type ?? l.type?.name ?? "relates to",
        url: other?.key ? `${this.baseUrl}/browse/${other.key}` : undefined,
      };
    }).filter((x) => x.key);

    const history = (raw.changelog?.histories ?? []).flatMap((h) =>
      (h.items ?? []).map((it) => ({
        field: it.field,
        from: it.fromString ?? undefined,
        to: it.toString ?? undefined,
        author: h.author?.displayName,
        at: h.created?.slice(0, 10),
      }))
    );

    return {
      id: raw.key,
      source: "jira",
      key: raw.key,
      title: f.summary ?? "",
      body: this.adfToText(f.description),
      state: f.status?.name ?? "Unknown",
      labels: f.labels ?? [],
      assignee: f.assignee?.displayName,
      author: f.reporter?.displayName,
      priority: f.priority?.name,
      comments: (f.comment?.comments ?? []).map((c) => ({
        author: c.author?.displayName ?? "unknown",
        body: this.adfToText(c.body),
        createdAt: c.created?.slice(0, 10),
      })),
      linkedIssues,
      attachments: (f.attachment ?? []).map((a) => ({ name: a.filename, url: a.content })),
      history: history.length ? history : undefined,
      url: `${this.baseUrl}/browse/${raw.key}`,
      createdAt: f.created?.slice(0, 10),
      updatedAt: f.updated?.slice(0, 10),
    };
  }

  async testConnection(): Promise<{ ok: boolean; detail: string }> {
    try {
      const res = await safeFetch(`${this.baseUrl}/rest/api/3/myself`, { headers: this.headers() });
      if (!res.ok) return { ok: false, detail: `Jira returned ${res.status}` };
      const me = JSON.parse(res.text) as { displayName?: string; emailAddress?: string };
      const project = this.projectKey ? ` · project ${this.projectKey}` : "";
      return { ok: true, detail: `Connected as ${me.displayName ?? me.emailAddress ?? "user"}${project}` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : "connection failed" };
    }
  }

  async getIssue(ref: string): Promise<NormalizedIssue | null> {
    try {
      const fields =
        "summary,description,status,labels,assignee,reporter,priority,comment,issuelinks,attachment,created,updated";
      const res = await withRetry(() =>
        safeFetch(
          `${this.baseUrl}/rest/api/3/issue/${encodeURIComponent(ref)}?fields=${fields}&expand=changelog`,
          { headers: this.headers() }
        )
      );
      if (!res.ok) return null;
      return this.normalize(JSON.parse(res.text) as JiraIssue);
    } catch {
      return null;
    }
  }

  async searchIssues(query: string, limit = 5): Promise<NormalizedIssue[]> {
    try {
      const clean = query.replace(/["\\]/g, " ").trim();
      const scope = this.projectKey ? `project = "${this.projectKey}" AND ` : "";
      const jql = encodeURIComponent(`${scope}text ~ "${clean}" ORDER BY updated DESC`);
      return this.searchJql(jql, limit);
    } catch {
      return [];
    }
  }

  /** Recent issues in the configured project (no text filter). */
  async listRecentIssues(limit = 8): Promise<NormalizedIssue[]> {
    try {
      const scope = this.projectKey ? `project = "${this.projectKey}"` : "updated >= -90d";
      const jql = encodeURIComponent(`${scope} ORDER BY updated DESC`);
      return this.searchJql(jql, limit);
    } catch {
      return [];
    }
  }

  private async searchJql(encodedJql: string, limit: number): Promise<NormalizedIssue[]> {
    const fields = "summary,description,status,labels,assignee,reporter,priority,created,updated";
    const res = await withRetry(() =>
      safeFetch(`${this.baseUrl}/rest/api/3/search/jql`, {
        method: "POST",
        headers: { ...this.headers(), "Content-Type": "application/json" },
        body: JSON.stringify({
          jql: decodeURIComponent(encodedJql),
          maxResults: Math.min(limit, 20),
          fields: fields.split(","),
        }),
      })
    );
    if (!res.ok) {
      // Fallback for older Jira Cloud tenants.
      const legacy = await withRetry(() =>
        safeFetch(
          `${this.baseUrl}/rest/api/3/search?jql=${encodedJql}&maxResults=${Math.min(limit, 20)}&fields=${fields}`,
          { headers: this.headers() }
        )
      );
      if (!legacy.ok) return [];
      const data = JSON.parse(legacy.text) as { issues?: JiraIssue[] };
      return (data.issues ?? []).map((i) => this.normalize(i));
    }
    const data = JSON.parse(res.text) as { issues?: JiraIssue[] };
    return (data.issues ?? []).map((i) => this.normalize(i));
  }

  async addComment(ref: string, body: string) {
    const res = await safeFetch(
      `${this.baseUrl}/rest/api/3/issue/${encodeURIComponent(ref)}/comment`,
      { method: "POST", headers: this.headers(), body: JSON.stringify({ body: this.textToAdf(body) }) }
    );
    if (!res.ok) throw new Error(`Jira addComment ${res.status}: ${res.text.slice(0, 200)}`);
    const data = JSON.parse(res.text) as { id?: string };
    return { ok: true, url: `${this.baseUrl}/browse/${ref}?focusedCommentId=${data.id ?? ""}` };
  }

  async listTransitions(ref: string): Promise<{ id: string; name: string }[]> {
    const res = await safeFetch(
      `${this.baseUrl}/rest/api/3/issue/${encodeURIComponent(ref)}/transitions`,
      { headers: this.headers() }
    );
    if (!res.ok) return [];
    const data = JSON.parse(res.text) as { transitions?: { id: string; name: string }[] };
    return data.transitions ?? [];
  }

  async transitionIssue(ref: string, transition: string): Promise<{ ok: boolean; url?: string }> {
    // Accept a transition id or a (case-insensitive) name.
    let id = transition;
    if (!/^\d+$/.test(transition)) {
      const all = await this.listTransitions(ref);
      const match = all.find((t) => t.name.toLowerCase() === transition.toLowerCase());
      if (!match) throw new Error(`No transition named "${transition}" for ${ref}`);
      id = match.id;
    }
    const res = await safeFetch(
      `${this.baseUrl}/rest/api/3/issue/${encodeURIComponent(ref)}/transitions`,
      { method: "POST", headers: this.headers(), body: JSON.stringify({ transition: { id } }) }
    );
    if (!res.ok) throw new Error(`Jira transition ${res.status}: ${res.text.slice(0, 200)}`);
    return { ok: true, url: `${this.baseUrl}/browse/${ref}` };
  }

  async linkIssues(from: string, to: string, linkType: string): Promise<{ ok: boolean }> {
    const res = await safeFetch(`${this.baseUrl}/rest/api/3/issueLink`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        type: { name: linkType },
        inwardIssue: { key: from },
        outwardIssue: { key: to },
      }),
    });
    if (!res.ok) throw new Error(`Jira link ${res.status}: ${res.text.slice(0, 200)}`);
    return { ok: true };
  }

  async createIssue(draft: JiraCreateDraft): Promise<{ ok: boolean; key?: string; url?: string }> {
    const res = await safeFetch(`${this.baseUrl}/rest/api/3/issue`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        fields: {
          project: { key: draft.projectKey },
          summary: draft.summary,
          description: this.textToAdf(draft.description),
          issuetype: { name: draft.issueType || "Task" },
        },
      }),
    });
    if (!res.ok) throw new Error(`Jira create ${res.status}: ${res.text.slice(0, 200)}`);
    const data = JSON.parse(res.text) as { key?: string };
    return { ok: true, key: data.key, url: data.key ? `${this.baseUrl}/browse/${data.key}` : undefined };
  }
}

interface JiraIssue {
  key: string;
  fields: {
    summary?: string;
    description?: unknown;
    status?: { name?: string };
    labels?: string[];
    assignee?: { displayName?: string };
    reporter?: { displayName?: string };
    priority?: { name?: string };
    comment?: { comments?: { author?: { displayName?: string }; body?: unknown; created?: string }[] };
    issuelinks?: {
      type?: { name?: string; inward?: string; outward?: string };
      inwardIssue?: { key?: string };
      outwardIssue?: { key?: string };
    }[];
    attachment?: { filename: string; content: string }[];
    created?: string;
    updated?: string;
  };
  changelog?: {
    histories?: {
      author?: { displayName?: string };
      created?: string;
      items?: { field: string; fromString?: string | null; toString?: string | null }[];
    }[];
  };
}
