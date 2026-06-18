import "server-only";

import type { RetrievedChunk, AnalysisCitation, RepoRef } from "./types";
import { embedQueryText } from "./embed";
import { getVectorStore, namespaceFor } from "./vector-store";

/**
 * Retrieval service. Embeds the query and returns the top matching chunks from
 * the repo's namespace, de-duplicated and lightly diversified across source
 * types (code/docs/issues/PRs/jira) so the analyzer sees a balanced context.
 */

export interface RetrievalOutcome {
  chunks: RetrievedChunk[];
  usedMockStore: boolean;
  usedOpenAI: boolean;
}

export async function retrieve(
  ref: RepoRef,
  query: string,
  topK = 12,
  extraNamespaces: string[] = []
): Promise<RetrievalOutcome> {
  const namespace = namespaceFor(`${ref.owner}/${ref.name}`, ref.branch ?? "main");
  const store = getVectorStore();
  const { vector, usedOpenAI } = await embedQueryText(query);

  // Query the repo namespace plus any extra source namespaces (API specs, CQL
  // docs, knowledge base), then merge + diversify across source types.
  const namespaces = [namespace, ...extraNamespaces];
  const raw: RetrievedChunk[] = [];
  for (const ns of namespaces) {
    try {
      raw.push(...(await store.query(ns, vector, topK * 2)));
    } catch {
      // skip unreachable/empty namespace
    }
  }
  raw.sort((a, b) => b.score - a.score);
  const diversified = diversify(raw, topK);

  return { chunks: diversified, usedMockStore: store.isMock, usedOpenAI };
}

/** Retrieve across an explicit set of namespaces (no repo assumption). */
export async function retrieveAcross(
  namespaces: string[],
  query: string,
  topK = 12
): Promise<RetrievalOutcome> {
  const store = getVectorStore();
  const { vector, usedOpenAI } = await embedQueryText(query);
  const raw: RetrievedChunk[] = [];
  for (const ns of namespaces) {
    try {
      raw.push(...(await store.query(ns, vector, topK * 2)));
    } catch {
      // skip
    }
  }
  raw.sort((a, b) => b.score - a.score);
  return { chunks: diversify(raw, topK), usedMockStore: store.isMock, usedOpenAI };
}

/** Round-robin across source types to avoid a single-file context dump. */
function diversify(chunks: RetrievedChunk[], topK: number): RetrievedChunk[] {
  const byType = new Map<string, RetrievedChunk[]>();
  for (const c of chunks) {
    const t = c.metadata.sourceType;
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(c);
  }
  for (const list of byType.values()) list.sort((a, b) => b.score - a.score);

  const out: RetrievedChunk[] = [];
  const seen = new Set<string>();
  let added = true;
  while (out.length < topK && added) {
    added = false;
    for (const list of byType.values()) {
      const next = list.shift();
      if (next && !seen.has(next.id)) {
        out.push(next);
        seen.add(next.id);
        added = true;
        if (out.length >= topK) break;
      }
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

export function citationFromChunk(c: RetrievedChunk): AnalysisCitation {
  const m = c.metadata;
  const isTicket =
    m.sourceType === "issue" || m.sourceType === "pr" || m.sourceType === "jira";
  return {
    label: isTicket
      ? `${m.title ?? m.filePath} (${m.filePath})`
      : `${m.filePath}${m.lineStart ? `:${m.lineStart}-${m.lineEnd}` : ""}${m.symbol ? ` · ${m.symbol}` : ""}`,
    sourceType: m.sourceType,
    filePath: isTicket ? undefined : m.filePath,
    lineStart: m.lineStart,
    lineEnd: m.lineEnd,
    url: m.url,
    ref: isTicket ? m.filePath : undefined,
  };
}
