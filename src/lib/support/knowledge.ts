import "server-only";

import type { SupportChunk, SourceType } from "./types";
import { getConfig } from "./config";
import { embedBatch } from "./embed";
import { getVectorStore } from "./vector-store";

/**
 * Knowledge base ingestion for non-repo RAG sources: previous support
 * resolutions, runbooks, and error logs. These augment the analyzer's context
 * so recurring issues resolve faster.
 */

export type KnowledgeKind = Extract<SourceType, "resolution" | "runbook" | "error-log">;

export function knowledgeNamespace(): string {
  const base = getConfig().pinecone.namespace;
  return (base ? `${base}__` : "") + "knowledge";
}

export async function addKnowledge(input: {
  kind: KnowledgeKind;
  title: string;
  text: string;
  url?: string;
}): Promise<{ namespace: string; id: string; usedMockStore: boolean; usedOpenAI: boolean }> {
  const now = new Date().toISOString();
  const namespace = knowledgeNamespace();
  const id = `${namespace}:${input.kind}:${slug(input.title)}:${Date.now()}`;
  const chunk: SupportChunk = {
    id,
    text: `${input.kind.toUpperCase()}: ${input.title}\n\n${input.text}`.slice(0, 8000),
    metadata: {
      repo: "knowledge",
      branch: "kb",
      filePath: input.title,
      language: "text",
      sourceType: input.kind,
      title: input.title,
      url: input.url,
      source_name: input.title,
      source_url: input.url,
      created_at: now,
      updated_at: now,
    },
  };
  const { vectors, usedOpenAI } = await embedBatch([chunk.text]);
  chunk.embedding = vectors[0];
  const store = getVectorStore();
  await store.upsert(namespace, [chunk]);
  return { namespace, id, usedMockStore: store.isMock, usedOpenAI };
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "item";
}
