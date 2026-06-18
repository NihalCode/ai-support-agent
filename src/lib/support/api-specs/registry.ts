import "server-only";

import type { NormalizedApiSpec } from "../types";
import { embedBatch } from "../embed";
import { getVectorStore } from "../vector-store";
import { chunkApiSpec, apiSpecNamespace } from "./index";

/**
 * In-memory registry of imported API specs (offline-first; survives within a
 * server process). Lets the agent enumerate providers and select endpoints.
 * Indexing additionally embeds endpoint chunks into the vector store so they
 * participate in RAG retrieval.
 */

const g = globalThis as unknown as { __apiSpecs?: Map<string, NormalizedApiSpec> };
const specs: Map<string, NormalizedApiSpec> = (g.__apiSpecs ??= new Map());

export function registerSpec(spec: NormalizedApiSpec): void {
  specs.set(spec.id, spec);
}

export function getSpec(id: string): NormalizedApiSpec | null {
  return specs.get(id) ?? null;
}

export function listSpecs(): NormalizedApiSpec[] {
  return [...specs.values()];
}

export function removeSpec(id: string): boolean {
  return specs.delete(id);
}

/** Embed + upsert a spec's endpoint chunks into its namespace. */
export async function indexSpec(
  spec: NormalizedApiSpec
): Promise<{ namespace: string; chunks: number; usedMockStore: boolean; usedOpenAI: boolean }> {
  registerSpec(spec);
  const chunks = chunkApiSpec(spec);
  const namespace = apiSpecNamespace(spec.id);
  if (chunks.length === 0) {
    const store = getVectorStore();
    return { namespace, chunks: 0, usedMockStore: store.isMock, usedOpenAI: false };
  }
  const { vectors, usedOpenAI } = await embedBatch(chunks.map((c) => c.text));
  chunks.forEach((c, i) => (c.embedding = vectors[i]));
  const store = getVectorStore();
  await store.upsert(namespace, chunks);
  return { namespace, chunks: chunks.length, usedMockStore: store.isMock, usedOpenAI };
}
