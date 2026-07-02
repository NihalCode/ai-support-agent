import "server-only";

import type { KnowledgeConnector, KnowledgeDocument } from "../types";
import { safeFetch } from "../../ssrf";
import { withRetry } from "../retry";
import { htmlToText } from "../cql/ingest-docs";

export class ConfluenceConnector implements KnowledgeConnector {
  readonly id = "confluence";
  readonly isMock = false;

  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly spaceKey: string | null;

  constructor(baseUrl: string, email: string, apiToken: string, spaceKey: string | null = null) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.authHeader = "Basic " + Buffer.from(`${email}:${apiToken}`).toString("base64");
    this.spaceKey = spaceKey;
  }

  private headers() {
    return {
      Authorization: this.authHeader,
      Accept: "application/json",
    };
  }

  async testConnection(): Promise<{ ok: boolean; detail: string }> {
    try {
      const res = await safeFetch(`${this.baseUrl}/wiki/rest/api/user/current`, {
        headers: this.headers(),
      });
      if (!res.ok) return { ok: false, detail: `Confluence returned ${res.status}` };
      const data = JSON.parse(res.text) as { displayName?: string; email?: string };
      const space = this.spaceKey ? ` · space ${this.spaceKey}` : "";
      return { ok: true, detail: `Connected as ${data.displayName ?? data.email ?? "user"}${space}` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : "connection failed" };
    }
  }

  async searchDocuments(query: string, limit = 10): Promise<KnowledgeDocument[]> {
    const clean = query.replace(/["\\]/g, " ").trim() || "page";
    const spaceClause = this.spaceKey ? `space=${this.spaceKey} AND ` : "";
    const cql = encodeURIComponent(`${spaceClause}type=page AND text ~ "${clean}" ORDER BY lastmodified DESC`);
    const res = await withRetry(() =>
      safeFetch(
        `${this.baseUrl}/wiki/rest/api/content/search?cql=${cql}&limit=${Math.min(limit, 25)}&expand=body.storage,version,space`,
        { headers: this.headers() }
      )
    ).catch(() => null);
    if (!res?.ok) return [];
    const data = JSON.parse(res.text) as { results?: ConfluencePage[] };
    return (data.results ?? []).map((page) => this.normalize(page));
  }

  async getDocument(id: string): Promise<KnowledgeDocument | null> {
    const res = await safeFetch(
      `${this.baseUrl}/wiki/rest/api/content/${encodeURIComponent(id)}?expand=body.storage,version,space`,
      { headers: this.headers() }
    ).catch(() => null);
    if (!res?.ok) return null;
    return this.normalize(JSON.parse(res.text) as ConfluencePage);
  }

  private normalize(page: ConfluencePage): KnowledgeDocument {
    const html = page.body?.storage?.value ?? "";
    return {
      id: page.id,
      source: "confluence",
      title: page.title,
      body: htmlToText(html),
      url: `${this.baseUrl}/wiki${page._links?.webui ?? `/pages/${page.id}`}`,
      spaceKey: page.space?.key,
      updatedAt: page.version?.when?.slice(0, 10),
    };
  }
}

export class MockConfluenceConnector implements KnowledgeConnector {
  readonly id = "confluence-mock";
  readonly isMock = true;

  private readonly docs: KnowledgeDocument[] = [
    {
      id: "conf-runbook-ctix-sync",
      source: "confluence",
      title: "Runbook: CTIX indicator sync failures",
      body: "Check CTIX API credentials, confirm tag filters use supported CQL syntax, then compare request IDs in Vercel logs before escalating.",
      url: "https://example.atlassian.net/wiki/spaces/SUP/pages/1001",
      spaceKey: "SUP",
      updatedAt: "2026-06-15",
    },
    {
      id: "conf-cql-tags",
      source: "confluence",
      title: "Support KB: CQL tag filtering",
      body: "For indicator triage, prefer tag_name exact matches and verify the payload includes required pagination fields.",
      url: "https://example.atlassian.net/wiki/spaces/SUP/pages/1002",
      spaceKey: "SUP",
      updatedAt: "2026-06-17",
    },
  ];

  async testConnection() {
    return { ok: true, detail: "Mock Confluence (demo data — set CONFLUENCE_* to go live)" };
  }

  async searchDocuments(query: string, limit = 10): Promise<KnowledgeDocument[]> {
    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    const scored = this.docs
      .map((doc) => ({
        doc,
        score: terms.filter((t) => `${doc.title} ${doc.body}`.toLowerCase().includes(t)).length,
      }))
      .sort((a, b) => b.score - a.score);
    const matched = scored.filter((x) => x.score > 0);
    return (matched.length ? matched : scored).slice(0, limit).map((x) => x.doc);
  }

  async getDocument(id: string): Promise<KnowledgeDocument | null> {
    return this.docs.find((d) => d.id === id) ?? null;
  }
}

interface ConfluencePage {
  id: string;
  title: string;
  body?: { storage?: { value?: string } };
  space?: { key?: string };
  version?: { when?: string };
  _links?: { webui?: string };
}
