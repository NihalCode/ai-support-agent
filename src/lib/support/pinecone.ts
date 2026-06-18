import "server-only";

/**
 * Minimal SDK-free Pinecone REST client (control plane + data plane).
 * Supports describe/create index, upsert, and query with namespaces.
 */

const CONTROL_PLANE = "https://api.pinecone.io";
const API_VERSION = "2025-01";

export interface PineconeCfg {
  apiKey: string;
  indexName: string;
  cloud: string;
  region: string;
}

export interface PineconeMatch {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

async function pc(url: string, apiKey: string, init: RequestInit = {}) {
  return fetch(url, {
    ...init,
    headers: {
      "Api-Key": apiKey,
      "Content-Type": "application/json",
      "X-Pinecone-API-Version": API_VERSION,
      ...(init.headers ?? {}),
    },
  });
}

const hostCache = new Map<string, string>();

/** Ensure the index exists (create serverless if missing) and return its host. */
export async function ensureIndexHost(cfg: PineconeCfg, dimension: number): Promise<string> {
  const cached = hostCache.get(cfg.indexName);
  if (cached) return cached;

  let res = await pc(`${CONTROL_PLANE}/indexes/${cfg.indexName}`, cfg.apiKey);
  if (res.status === 404) {
    const create = await pc(`${CONTROL_PLANE}/indexes`, cfg.apiKey, {
      method: "POST",
      body: JSON.stringify({
        name: cfg.indexName,
        dimension,
        metric: "cosine",
        spec: { serverless: { cloud: cfg.cloud, region: cfg.region } },
      }),
    });
    if (!create.ok && create.status !== 409) {
      throw new Error(`Pinecone create index ${create.status}: ${(await create.text()).slice(0, 200)}`);
    }
    // Poll for readiness.
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      res = await pc(`${CONTROL_PLANE}/indexes/${cfg.indexName}`, cfg.apiKey);
      if (res.ok) {
        const d = (await res.clone().json()) as { status?: { ready?: boolean } };
        if (d.status?.ready) break;
      }
    }
  }
  if (!res.ok) {
    throw new Error(`Pinecone describe index ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { host?: string };
  if (!data.host) throw new Error("Pinecone index has no host yet");
  hostCache.set(cfg.indexName, data.host);
  return data.host;
}

export async function upsertVectors(
  cfg: PineconeCfg,
  host: string,
  namespace: string,
  vectors: { id: string; values: number[]; metadata: Record<string, unknown> }[]
): Promise<number> {
  let upserted = 0;
  for (let i = 0; i < vectors.length; i += 100) {
    const batch = vectors.slice(i, i + 100);
    const res = await pc(`https://${host}/vectors/upsert`, cfg.apiKey, {
      method: "POST",
      body: JSON.stringify({ vectors: batch, namespace }),
    });
    if (!res.ok) {
      throw new Error(`Pinecone upsert ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const d = (await res.json()) as { upsertedCount?: number };
    upserted += d.upsertedCount ?? batch.length;
  }
  return upserted;
}

/** Index stats including per-namespace vector counts. */
export async function indexStats(
  cfg: PineconeCfg,
  host: string
): Promise<{ namespaces: Record<string, { vectorCount: number }> }> {
  const res = await pc(`https://${host}/describe_index_stats`, cfg.apiKey, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Pinecone stats ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const d = (await res.json()) as { namespaces?: Record<string, { vectorCount?: number }> };
  const namespaces: Record<string, { vectorCount: number }> = {};
  for (const [ns, v] of Object.entries(d.namespaces ?? {})) {
    namespaces[ns] = { vectorCount: v.vectorCount ?? 0 };
  }
  return { namespaces };
}

/** Delete all vectors in a namespace. */
export async function deleteNamespace(cfg: PineconeCfg, host: string, namespace: string): Promise<void> {
  const res = await pc(`https://${host}/vectors/delete`, cfg.apiKey, {
    method: "POST",
    body: JSON.stringify({ deleteAll: true, namespace }),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Pinecone delete ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

export async function queryVectors(
  cfg: PineconeCfg,
  host: string,
  namespace: string,
  vector: number[],
  topK: number
): Promise<PineconeMatch[]> {
  const res = await pc(`https://${host}/query`, cfg.apiKey, {
    method: "POST",
    body: JSON.stringify({
      vector,
      topK,
      namespace,
      includeMetadata: true,
      includeValues: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`Pinecone query ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const d = (await res.json()) as { matches?: PineconeMatch[] };
  return d.matches ?? [];
}
