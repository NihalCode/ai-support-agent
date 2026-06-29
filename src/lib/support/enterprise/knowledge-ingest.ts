import "server-only";

import { getConfluenceDocs } from "../connectors";
import { hasConfluence, getConfig } from "../config";
import { chunkKnowledgeDocument } from "../chunk";
import { embedBatch } from "../embed";
import { getVectorStore } from "../vector-store";
import type { SupportChunk } from "../types";

export function enterpriseKnowledgeNamespace(): string {
  const base = getConfig().pinecone.namespace;
  return (base ? `${base}__` : "") + "knowledge";
}

export interface EnterpriseKnowledgeIngestResult {
  namespace: string;
  confluence: {
    configured: boolean;
    mock: boolean;
    documents: number;
    chunks: number;
  };
  upserted: number;
  usedMockStore: boolean;
  usedOpenAI: boolean;
  warnings: string[];
}

export async function ingestEnterpriseKnowledge(
  query = "support runbook api cql incident troubleshooting"
): Promise<EnterpriseKnowledgeIngestResult> {
  const warnings: string[] = [];
  const cfg = getConfig();
  const { connector, mock } = await getConfluenceDocs();
  const chunks: SupportChunk[] = [];
  let documentCount = 0;

  if (hasConfluence(cfg) || mock) {
    try {
      const docs = await connector.searchDocuments(query, 50);
      documentCount = docs.length;
      for (const doc of docs) chunks.push(...chunkKnowledgeDocument(doc));
    } catch (err) {
      warnings.push(`Confluence ingest failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const store = getVectorStore();
  if (chunks.length === 0) {
    return {
      namespace: enterpriseKnowledgeNamespace(),
      confluence: { configured: hasConfluence(cfg), mock, documents: 0, chunks: 0 },
      upserted: 0,
      usedMockStore: store.isMock,
      usedOpenAI: false,
      warnings,
    };
  }

  const { vectors, usedOpenAI } = await embedBatch(chunks.map((c) => c.text));
  chunks.forEach((c, i) => (c.embedding = vectors[i]));
  const upserted = await store.upsert(enterpriseKnowledgeNamespace(), chunks);

  return {
    namespace: enterpriseKnowledgeNamespace(),
    confluence: {
      configured: hasConfluence(cfg),
      mock,
      documents: documentCount,
      chunks: chunks.length,
    },
    upserted,
    usedMockStore: store.isMock,
    usedOpenAI,
    warnings,
  };
}
