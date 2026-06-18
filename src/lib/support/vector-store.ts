import "server-only";

import type { SupportChunk, RetrievedChunk, ChunkMetadata } from "./types";
import { getConfig, hasPinecone } from "./config";
import {
  ensureIndexHost,
  upsertVectors,
  queryVectors,
  indexStats,
  deleteNamespace as pineconeDeleteNamespace,
  type PineconeCfg,
} from "./pinecone";
import { EMBEDDING_DIMENSION } from "./openai";

/**
 * Vector store abstraction. Uses Pinecone when PINECONE_API_KEY is set;
 * otherwise an in-memory cosine store that persists for the life of the server
 * process (great for local demo + tests; not durable across deploys).
 */

interface StoredVector {
  id: string;
  values: number[];
  text: string;
  metadata: ChunkMetadata;
}

// Module-global so the in-memory store survives across requests in one process.
const g = globalThis as unknown as {
  __supportMemStore?: Map<string, StoredVector[]>;
};
const memStore: Map<string, StoredVector[]> = (g.__supportMemStore ??= new Map());

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface VectorStore {
  readonly isMock: boolean;
  upsert(namespace: string, chunks: SupportChunk[]): Promise<number>;
  query(
    namespace: string,
    embedding: number[],
    topK: number
  ): Promise<RetrievedChunk[]>;
  listNamespaces(): Promise<{ namespace: string; vectorCount: number }[]>;
  deleteNamespace(namespace: string): Promise<void>;
}

class PineconeStore implements VectorStore {
  readonly isMock = false;
  private cfg: PineconeCfg;
  constructor(cfg: PineconeCfg) {
    this.cfg = cfg;
  }
  async upsert(namespace: string, chunks: SupportChunk[]): Promise<number> {
    const host = await ensureIndexHost(this.cfg, EMBEDDING_DIMENSION);
    const vectors = chunks
      .filter((c) => c.embedding && c.embedding.length > 0)
      .map((c) => ({
        id: c.id,
        values: c.embedding as number[],
        // Pinecone metadata: flatten + include text for retrieval display.
        metadata: { ...c.metadata, _text: c.text.slice(0, 4000) } as Record<
          string,
          unknown
        >,
      }));
    return upsertVectors(this.cfg, host, namespace, vectors);
  }
  async query(
    namespace: string,
    embedding: number[],
    topK: number
  ): Promise<RetrievedChunk[]> {
    const host = await ensureIndexHost(this.cfg, EMBEDDING_DIMENSION);
    const matches = await queryVectors(this.cfg, host, namespace, embedding, topK);
    return matches.map((m) => {
      const md = (m.metadata ?? {}) as Record<string, unknown>;
      const { _text, ...rest } = md;
      return {
        id: m.id,
        score: m.score,
        text: typeof _text === "string" ? _text : "",
        metadata: rest as unknown as ChunkMetadata,
      };
    });
  }
  async listNamespaces(): Promise<{ namespace: string; vectorCount: number }[]> {
    const host = await ensureIndexHost(this.cfg, EMBEDDING_DIMENSION);
    const stats = await indexStats(this.cfg, host);
    return Object.entries(stats.namespaces).map(([namespace, v]) => ({ namespace, vectorCount: v.vectorCount }));
  }
  async deleteNamespace(namespace: string): Promise<void> {
    const host = await ensureIndexHost(this.cfg, EMBEDDING_DIMENSION);
    await pineconeDeleteNamespace(this.cfg, host, namespace);
  }
}

class MemoryStore implements VectorStore {
  readonly isMock = true;
  async upsert(namespace: string, chunks: SupportChunk[]): Promise<number> {
    const existing = memStore.get(namespace) ?? [];
    const byId = new Map(existing.map((v) => [v.id, v]));
    for (const c of chunks) {
      if (!c.embedding || c.embedding.length === 0) continue;
      byId.set(c.id, {
        id: c.id,
        values: c.embedding,
        text: c.text,
        metadata: c.metadata,
      });
    }
    memStore.set(namespace, [...byId.values()]);
    return chunks.length;
  }
  async query(
    namespace: string,
    embedding: number[],
    topK: number
  ): Promise<RetrievedChunk[]> {
    const vectors = memStore.get(namespace) ?? [];
    return vectors
      .map((v) => ({
        id: v.id,
        score: cosine(embedding, v.values),
        text: v.text,
        metadata: v.metadata,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
  async listNamespaces(): Promise<{ namespace: string; vectorCount: number }[]> {
    return [...memStore.entries()].map(([namespace, vecs]) => ({ namespace, vectorCount: vecs.length }));
  }
  async deleteNamespace(namespace: string): Promise<void> {
    memStore.delete(namespace);
  }
}

export function getVectorStore(): VectorStore {
  const cfg = getConfig();
  if (hasPinecone(cfg) && cfg.pinecone.apiKey) {
    return new PineconeStore({
      apiKey: cfg.pinecone.apiKey,
      indexName: cfg.pinecone.indexName,
      cloud: cfg.pinecone.cloud,
      region: cfg.pinecone.region,
    });
  }
  return new MemoryStore();
}

/** Namespace per repo+branch so multiple repos coexist in one index. */
export function namespaceFor(repo: string, branch: string): string {
  return `${repo}@${branch}`.replace(/[^a-zA-Z0-9_@.-]/g, "_");
}
