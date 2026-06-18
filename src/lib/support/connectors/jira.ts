import "server-only";

import type { TicketConnector, NormalizedIssue } from "../types";
import { safeFetch } from "../../ssrf";

/**
 * Real Jira Cloud connector (REST API v3) using basic auth (email + API token).
 * The base URL is user/operator-supplied, so all calls go through safeFetch's
 * SSRF guard.
 */

export class JiraConnector implements TicketConnector {
  readonly id = "jira";
  readonly isMock = false;
  private baseUrl: string;
  private authHeader: string;

  constructor(baseUrl: string, email: string, apiToken: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.authHeader =
      "Basic " + Buffer.from(`${email}:${apiToken}`).toString("base64");
  }

  private headers() {
    return {
      Authorization: this.authHeader,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }

  private adfToText(adf: unknown): string {
    // Flatten Atlassian Document Format to plain text.
    if (!adf || typeof adf !== "object") return typeof adf === "string" ? adf : "";
    const node = adf as { text?: string; content?: unknown[] };
    if (node.text) return node.text;
    if (Array.isArray(node.content)) {
      return node.content.map((c) => this.adfToText(c)).join(" ");
    }
    return "";
  }

  private normalize(raw: JiraIssue): NormalizedIssue {
    const f = raw.fields;
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
      comments: (f.comment?.comments ?? []).map((c) => ({
        author: c.author?.displayName ?? "unknown",
        body: this.adfToText(c.body),
        createdAt: c.created?.slice(0, 10),
      })),
      url: `${this.baseUrl}/browse/${raw.key}`,
      createdAt: f.created?.slice(0, 10),
      updatedAt: f.updated?.slice(0, 10),
    };
  }

  async getIssue(ref: string): Promise<NormalizedIssue | null> {
    try {
      const res = await safeFetch(
        `${this.baseUrl}/rest/api/3/issue/${encodeURIComponent(ref)}?fields=summary,description,status,labels,assignee,reporter,comment,created,updated`,
        { headers: this.headers() }
      );
      if (!res.ok) return null;
      return this.normalize(JSON.parse(res.text) as JiraIssue);
    } catch {
      return null;
    }
  }

  async searchIssues(query: string, limit = 5): Promise<NormalizedIssue[]> {
    try {
      const jql = encodeURIComponent(`text ~ "${query.replace(/"/g, "")}" ORDER BY updated DESC`);
      const res = await safeFetch(
        `${this.baseUrl}/rest/api/3/search?jql=${jql}&maxResults=${Math.min(limit, 20)}&fields=summary,description,status,labels,assignee,reporter,created,updated`,
        { headers: this.headers() }
      );
      if (!res.ok) return [];
      const data = JSON.parse(res.text) as { issues?: JiraIssue[] };
      return (data.issues ?? []).map((i) => this.normalize(i));
    } catch {
      return [];
    }
  }

  async addComment(ref: string, body: string) {
    const res = await safeFetch(
      `${this.baseUrl}/rest/api/3/issue/${encodeURIComponent(ref)}/comment`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          body: {
            type: "doc",
            version: 1,
            content: [{ type: "paragraph", content: [{ type: "text", text: body }] }],
          },
        }),
      }
    );
    if (!res.ok) throw new Error(`Jira addComment ${res.status}`);
    const data = JSON.parse(res.text) as { id?: string };
    return { ok: true, url: `${this.baseUrl}/browse/${ref}?focusedCommentId=${data.id ?? ""}` };
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
    comment?: { comments?: { author?: { displayName?: string }; body?: unknown; created?: string }[] };
    created?: string;
    updated?: string;
  };
}
