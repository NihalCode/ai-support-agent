import "server-only";

import { listSpecs } from "@/lib/support/api-specs/registry";
import { apiSpecNamespace } from "@/lib/support/api-specs/index";
import { retrieveAcross } from "@/lib/support/retrieve";
import { getConfig, hasOpenAI, hasPinecone } from "@/lib/support/config";
import { getJiraTickets } from "@/lib/support/connectors";
import { listInvestigations } from "@/lib/support/investigation/object-store";
import { isTestMode } from "@/lib/test-mode";
import type {
  WorkspaceSearchRequest,
  WorkspaceSearchResponse,
  WorkspaceSearchResult,
  WorkspaceSearchSourceType,
  SearchMode,
} from "./types";

function mapSourceType(st: string): WorkspaceSearchSourceType {
  const m: Record<string, WorkspaceSearchSourceType> = {
    openapi: "openapi",
    postman: "postman",
    "cyware-doc": "api-doc",
    docs: "api-doc",
    "cql-doc": "cql",
    code: "code",
    jira: "jira",
    issue: "jira",
    "error-log": "logs",
    resolution: "release-note",
  };
  return m[st] ?? "api-doc";
}

function mockSearchResults(query: string): WorkspaceSearchResult[] {
  return [
    {
      id: "mock-tag-bulk",
      title: "POST /v3/tags/bulk/",
      sourceType: "api-doc",
      sourceName: "Cyware CTIX API",
      product: "CTIX",
      score: 0.92,
      matchedText: "Bulk tag creation endpoint. Required fields: name, type.",
      highlightedText: `Bulk tag creation — matches "${query}"`,
      metadata: { method: "POST", path: "/v3/tags/bulk/" },
      openTarget: {
        kind: "endpoint",
        tabId: "ep-POST-/v3/tags/bulk/",
        title: "POST /v3/tags/bulk/",
        payload: { method: "POST", path: "/v3/tags/bulk/", name: "Bulk tags" },
      },
    },
    {
      id: "mock-cql-tags",
      title: "CQL: tag filters",
      sourceType: "cql",
      sourceName: "CQL Documentation",
      product: "CTIX",
      score: 0.85,
      matchedText: "Filter indicators by tag name using tag_name operator.",
      metadata: {},
      openTarget: {
        kind: "cql",
        tabId: "cql-workspace",
        title: "CQL",
      },
    },
    {
      id: "mock-jira-1",
      title: "AISUP-42 Tag bulk API returns 400",
      sourceType: "jira",
      sourceName: "Jira",
      score: 0.78,
      matchedText: "Customer reports 400 on bulk tag creation since v3.2.",
      metadata: { key: "AISUP-42", status: "Open" },
      openTarget: {
        kind: "jira-ticket",
        tabId: "jira-AISUP-42",
        title: "AISUP-42",
        payload: { key: "AISUP-42", title: "Tag bulk API returns 400" },
      },
    },
  ];
}

async function keywordSearch(query: string): Promise<WorkspaceSearchResult[]> {
  const q = query.toLowerCase();
  const results: WorkspaceSearchResult[] = [];

  for (const spec of listSpecs()) {
    if (spec.name.toLowerCase().includes(q)) {
      results.push({
        id: `spec-${spec.id}`,
        title: spec.name,
        sourceType: spec.sourceKind === "postman" ? "postman" : "openapi",
        sourceName: spec.name,
        matchedText: `${spec.endpoints.length} endpoints`,
        metadata: { specId: spec.id, endpoints: spec.endpoints.length },
        openTarget: {
          kind: "api-registry",
          tabId: `registry-${spec.id}`,
          title: spec.name,
          payload: { specId: spec.id },
        },
      });
    }
    for (const ep of spec.endpoints) {
      const hay = `${ep.method} ${ep.path} ${ep.name} ${ep.description ?? ""}`.toLowerCase();
      if (hay.includes(q)) {
        results.push({
          id: `ep-${spec.id}-${ep.method}-${ep.path}`,
          title: `${ep.method} ${ep.path}`,
          sourceType: "api-doc",
          sourceName: spec.name,
          product: spec.name.split(" ")[0],
          matchedText: ep.description ?? ep.name,
          metadata: { method: ep.method, path: ep.path, specId: spec.id },
          openTarget: {
            kind: "endpoint",
            tabId: `ep-${ep.method}-${ep.path}`,
            title: `${ep.method} ${ep.path}`,
            payload: { method: ep.method, path: ep.path, specId: spec.id, name: ep.name },
          },
        });
      }
    }
  }

  try {
    const jira = getJiraTickets();
    const jiraIssues = await jira.connector.searchIssues(query, 8).catch(() => []);
    for (const t of jiraIssues) {
      const key = t.key ?? t.id;
      results.push({
        id: `jira-${key}`,
        title: t.title,
        sourceType: "jira",
        sourceName: "Jira",
        matchedText: t.title,
        metadata: { key, status: t.state },
        openTarget: {
          kind: "jira-ticket",
          tabId: `jira-${key}`,
          title: String(key),
          payload: { key, title: t.title },
        },
      });
    }
  } catch {
    /* jira optional */
  }

  for (const inv of listInvestigations()) {
    if (inv.title.toLowerCase().includes(q) || inv.userIssue.toLowerCase().includes(q)) {
      results.push({
        id: `inv-${inv.id}`,
        title: inv.title,
        sourceType: "investigation",
        sourceName: "Investigation",
        matchedText: inv.userIssue,
        metadata: { investigationId: inv.id },
        openTarget: {
          kind: "investigation",
          tabId: "investigation-main",
          title: "Investigation",
          payload: { investigationId: inv.id },
        },
      });
    }
  }

  return results.slice(0, 30);
}

async function semanticSearch(query: string, topK: number): Promise<{
  results: WorkspaceSearchResult[];
  usedMockStore: boolean;
  usedOpenAI: boolean;
  degraded: boolean;
  degradedReason?: string;
}> {
  if (isTestMode()) {
    return {
      results: mockSearchResults(query),
      usedMockStore: true,
      usedOpenAI: false,
      degraded: false,
    };
  }

  const cfg = getConfig();
  const namespaces = listSpecs().map((s) => apiSpecNamespace(s.id));
  namespaces.push("cql-docs", "knowledge");

  if (namespaces.length === 0) {
    return {
      results: [],
      usedMockStore: true,
      usedOpenAI: false,
      degraded: true,
      degradedReason: "No indexed sources — run bootstrap or import APIs first.",
    };
  }

  const { chunks, usedMockStore, usedOpenAI } = await retrieveAcross(namespaces, query, topK);
  const degraded = !hasPinecone(cfg) || !hasOpenAI(cfg);

  const results: WorkspaceSearchResult[] = chunks.map((c) => {
    const m = c.metadata;
    const sourceType = mapSourceType(m.sourceType);
    const title =
      m.title ??
      (m.endpoint_path ? `${m.http_method ?? "GET"} ${m.endpoint_path}` : m.filePath);
    return {
      id: c.id,
      title,
      sourceType,
      sourceName: m.source_name ?? m.repo ?? "Unknown",
      product: m.source_name?.split(" ")[0],
      score: c.score,
      matchedText: c.text.slice(0, 280),
      highlightedText: c.text.slice(0, 120),
      metadata: {
        endpoint: m.endpoint_path,
        method: m.http_method,
        filePath: m.filePath,
        url: m.url,
      },
      openTarget: m.endpoint_path
        ? {
            kind: "endpoint",
            tabId: `ep-${m.http_method}-${m.endpoint_path}`,
            title: `${m.http_method ?? "GET"} ${m.endpoint_path}`,
            payload: {
              method: m.http_method ?? "GET",
              path: m.endpoint_path,
            },
          }
        : {
            kind: sourceType === "cql" ? "cql" : "api-registry",
            tabId: sourceType === "cql" ? "cql-workspace" : "api-registry",
            title,
          },
    };
  });

  return {
    results,
    usedMockStore,
    usedOpenAI,
    degraded,
    degradedReason: degraded
      ? "Semantic search using local vector store — configure Pinecone + OpenAI for production RAG."
      : undefined,
  };
}

function applyFilters(
  results: WorkspaceSearchResult[],
  filters?: WorkspaceSearchRequest["filters"]
): WorkspaceSearchResult[] {
  if (!filters) return results;
  return results.filter((r) => {
    if (filters.sourceTypes?.length && !filters.sourceTypes.includes(r.sourceType)) return false;
    if (filters.product && !r.product?.toLowerCase().includes(filters.product.toLowerCase())) return false;
    if (filters.specId && r.metadata.specId !== filters.specId) return false;
    if (filters.method && r.metadata.method !== filters.method) return false;
    if (filters.jiraStatus && r.metadata.status !== filters.jiraStatus) return false;
    return true;
  });
}

function mergeHybrid(keyword: WorkspaceSearchResult[], semantic: WorkspaceSearchResult[]): WorkspaceSearchResult[] {
  const byId = new Map<string, WorkspaceSearchResult>();
  for (const r of semantic) byId.set(r.id, r);
  for (const r of keyword) {
    const existing = byId.get(r.id);
    if (existing) {
      byId.set(r.id, { ...existing, score: Math.max(existing.score ?? 0, 0.5) });
    } else {
      byId.set(r.id, { ...r, score: r.score ?? 0.4 });
    }
  }
  return [...byId.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

export async function workspaceSearch(req: WorkspaceSearchRequest): Promise<WorkspaceSearchResponse> {
  const mode: SearchMode = req.mode ?? "hybrid";
  const topK = req.topK ?? 20;
  const query = req.query.trim();
  if (!query) return { results: [], mode };

  if (mode === "keyword") {
    const results = applyFilters(await keywordSearch(query), req.filters);
    return { results, mode };
  }

  if (mode === "semantic") {
    const sem = await semanticSearch(query, topK);
    return {
      results: applyFilters(sem.results, req.filters),
      mode,
      degraded: sem.degraded,
      degradedReason: sem.degradedReason,
      usedMockStore: sem.usedMockStore,
      usedOpenAI: sem.usedOpenAI,
    };
  }

  const [kw, sem] = await Promise.all([keywordSearch(query), semanticSearch(query, topK)]);
  const merged = mergeHybrid(kw, sem.results);
  return {
    results: applyFilters(merged, req.filters).slice(0, topK),
    mode: "hybrid",
    degraded: sem.degraded,
    degradedReason: sem.degradedReason,
    usedMockStore: sem.usedMockStore,
    usedOpenAI: sem.usedOpenAI,
  };
}
