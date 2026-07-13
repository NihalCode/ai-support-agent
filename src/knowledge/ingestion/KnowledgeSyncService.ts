import "server-only";

import type { CywareProductId } from "@/lib/support/cyware-products";
import { importCywareProduct } from "@/lib/support/api-specs/cyware-import";
import { apiSpecNamespace } from "@/lib/support/api-specs/index";
import { indexSpec } from "@/lib/support/api-specs/registry";
import { ingestCqlDocs } from "@/lib/support/cql/ingest-docs";
import { cqlNamespace } from "@/lib/support/cql/ingest-docs";
import { ingestEnterpriseKnowledge, enterpriseKnowledgeNamespace } from "@/lib/support/enterprise/knowledge-ingest";
import {
  ingestZendeskTickets,
  zendeskContentChecksum,
  zendeskTicketNamespace,
} from "@/lib/support/enterprise/zendesk-ticket-ingest";
import { getVectorStore } from "@/lib/support/vector-store";
import { safeFetch } from "@/lib/ssrf";
import { htmlToText } from "@/lib/support/cql/ingest-docs";
import { getConfluenceDocs } from "@/lib/support/connectors";
import { getConfig, hasConfluence } from "@/lib/support/config";
import { chunkKnowledgeDocument } from "@/lib/support/chunk";
import { embedBatch } from "@/lib/support/embed";

import {
  getKnowledgeSource,
  listEnabledKnowledgeSources,
} from "../sources/SourceRegistry";
import {
  checksumForContent,
  createKnowledgeSyncRun,
  finishKnowledgeSyncRun,
  getKnowledgeDocumentState,
  upsertKnowledgeDocumentState,
} from "../stores/knowledge-sync-store";
import type {
  KnowledgeSyncResult,
  KnowledgeSyncSourceResult,
} from "../types";
import { metrics } from "@/metrics/MetricsService";

function specChecksum(spec: { endpoints: { method: string; path: string }[] }): string {
  const payload = spec.endpoints
    .map((e) => `${e.method}:${e.path}`)
    .sort()
    .join("\n");
  return checksumForContent(payload);
}

async function syncCywareProduct(
  productId: CywareProductId,
  sourceId: string,
  url: string,
  force: boolean
): Promise<KnowledgeSyncSourceResult> {
  const warnings: string[] = [];
  try {
    const live = process.env.AUTO_IMPORT_LIVE_CYWARE === "true" || force;
    const imported = await importCywareProduct(productId, {
      index: false,
      forceLive: live,
    });
    warnings.push(...imported.warnings);

    const checksum = specChecksum(imported.spec);
    const prev = await getKnowledgeDocumentState(sourceId);
    if (!force && prev?.checksum === checksum) {
      return {
        sourceId,
        ok: true,
        skipped: true,
        chunks: prev.chunkCount,
        checksum,
        namespace: apiSpecNamespace(imported.spec.id),
        warnings,
      };
    }

    const namespace = apiSpecNamespace(imported.spec.id);
    const store = getVectorStore();
    await store.deleteNamespace(namespace);
    const indexed = await indexSpec(imported.spec);

    await upsertKnowledgeDocumentState({
      sourceId,
      url,
      checksum,
      vectorIds: [],
      namespace,
      lastIndexedAt: new Date().toISOString(),
      status: "active",
      chunkCount: indexed.chunks,
    });

    return {
      sourceId,
      ok: true,
      skipped: false,
      chunks: indexed.chunks,
      checksum,
      namespace,
      warnings,
    };
  } catch (err) {
    return {
      sourceId,
      ok: false,
      skipped: false,
      chunks: 0,
      error: err instanceof Error ? err.message : String(err),
      warnings,
    };
  }
}

async function syncCql(sourceId: string, url: string, force: boolean): Promise<KnowledgeSyncSourceResult> {
  const warnings: string[] = [];
  try {
    const res = await safeFetch(url, {}, { timeoutMs: 30_000 });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const html = res.text;
    const checksum = checksumForContent(html);
    const prev = await getKnowledgeDocumentState(sourceId);
    if (!force && prev?.checksum === checksum) {
      return {
        sourceId,
        ok: true,
        skipped: true,
        chunks: prev.chunkCount,
        checksum,
        namespace: cqlNamespace(),
        warnings,
      };
    }

    const result = await ingestCqlDocs(url);
    warnings.push(...result.warnings);

    await upsertKnowledgeDocumentState({
      sourceId,
      url,
      checksum,
      vectorIds: [],
      namespace: cqlNamespace(),
      lastIndexedAt: new Date().toISOString(),
      status: "active",
      chunkCount: result.chunks,
    });

    return {
      sourceId,
      ok: true,
      skipped: false,
      chunks: result.chunks,
      checksum,
      namespace: cqlNamespace(),
      warnings,
    };
  } catch (err) {
    return {
      sourceId,
      ok: false,
      skipped: false,
      chunks: 0,
      error: err instanceof Error ? err.message : String(err),
      warnings,
    };
  }
}

async function confluenceContentChecksum(): Promise<string> {
  const cfg = getConfig();
  const { connector, mock } = await getConfluenceDocs();
  if (!hasConfluence(cfg) && !mock) {
    return checksumForContent("no-confluence");
  }
  const docs = await connector.searchDocuments(
    "support runbook api cql incident troubleshooting",
    50
  );
  const payload = docs
    .map((d) => `${d.id}:${d.updatedAt ?? ""}:${d.body.length}`)
    .sort()
    .join("\n");
  return checksumForContent(payload);
}

async function syncConfluence(sourceId: string, force: boolean): Promise<KnowledgeSyncSourceResult> {
  const warnings: string[] = [];
  try {
    const checksum = await confluenceContentChecksum();
    const prev = await getKnowledgeDocumentState(sourceId);
    if (!force && prev?.checksum === checksum) {
      return {
        sourceId,
        ok: true,
        skipped: true,
        chunks: prev.chunkCount,
        checksum,
        namespace: enterpriseKnowledgeNamespace(),
        warnings,
      };
    }

    const store = getVectorStore();
    if (force) await store.deleteNamespace(enterpriseKnowledgeNamespace());

    const result = await ingestEnterpriseKnowledge();
    warnings.push(...result.warnings);

    await upsertKnowledgeDocumentState({
      sourceId,
      url: "confluence",
      checksum,
      vectorIds: [],
      namespace: enterpriseKnowledgeNamespace(),
      lastIndexedAt: new Date().toISOString(),
      status: "active",
      chunkCount: result.upserted,
    });

    return {
      sourceId,
      ok: true,
      skipped: false,
      chunks: result.upserted,
      checksum,
      namespace: enterpriseKnowledgeNamespace(),
      warnings,
    };
  } catch (err) {
    return {
      sourceId,
      ok: false,
      skipped: false,
      chunks: 0,
      error: err instanceof Error ? err.message : String(err),
      warnings,
    };
  }
}

async function syncZendesk(sourceId: string, force: boolean): Promise<KnowledgeSyncSourceResult> {
  const warnings: string[] = [];
  try {
    const checksum = await zendeskContentChecksum();
    const prev = await getKnowledgeDocumentState(sourceId);
    if (!force && prev?.checksum === checksum && prev.chunkCount > 0) {
      return {
        sourceId,
        ok: true,
        skipped: true,
        chunks: prev.chunkCount,
        checksum,
        namespace: zendeskTicketNamespace(),
        warnings,
      };
    }

    const store = getVectorStore();
    if (force) await store.deleteNamespace(zendeskTicketNamespace());

    const result = await ingestZendeskTickets({ force });
    warnings.push(...result.warnings);

    await upsertKnowledgeDocumentState({
      sourceId,
      url: "zendesk",
      checksum: result.checksum,
      vectorIds: [],
      namespace: result.namespace,
      lastIndexedAt: new Date().toISOString(),
      status: "active",
      chunkCount: result.upserted,
    });

    return {
      sourceId,
      ok: true,
      skipped: result.skipped,
      chunks: result.upserted,
      checksum: result.checksum,
      namespace: result.namespace,
      warnings,
    };
  } catch (err) {
    return {
      sourceId,
      ok: false,
      skipped: false,
      chunks: 0,
      error: err instanceof Error ? err.message : String(err),
      warnings,
    };
  }
}

async function syncSupportDocs(
  sourceId: string,
  url: string,
  force: boolean
): Promise<KnowledgeSyncSourceResult> {
  const warnings: string[] = [];
  try {
    const res = await safeFetch(url, {}, { timeoutMs: 30_000 });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = res.text;
    const text = raw.includes("<html") ? htmlToText(raw) : raw;
    const checksum = checksumForContent(text);
    const prev = await getKnowledgeDocumentState(sourceId);
    const namespace = `${enterpriseKnowledgeNamespace()}__support`;

    if (!force && prev?.checksum === checksum) {
      return {
        sourceId,
        ok: true,
        skipped: true,
        chunks: prev.chunkCount,
        checksum,
        namespace,
        warnings,
      };
    }

    const store = getVectorStore();
    if (force) await store.deleteNamespace(namespace);

    const doc = {
      id: sourceId,
      source: "support_docs",
      title: "Support documentation",
      body: text,
      url,
      updatedAt: new Date().toISOString(),
    };
    const chunks = chunkKnowledgeDocument(doc);
    const { vectors } = await embedBatch(chunks.map((c) => c.text));
    chunks.forEach((c, i) => (c.embedding = vectors[i]));
    const upserted = await store.upsert(namespace, chunks);

    await upsertKnowledgeDocumentState({
      sourceId,
      url,
      checksum,
      vectorIds: chunks.map((c) => c.id),
      namespace,
      lastIndexedAt: new Date().toISOString(),
      status: "active",
      chunkCount: upserted,
    });

    return {
      sourceId,
      ok: true,
      skipped: false,
      chunks: upserted,
      checksum,
      namespace,
      warnings,
    };
  } catch (err) {
    return {
      sourceId,
      ok: false,
      skipped: false,
      chunks: 0,
      error: err instanceof Error ? err.message : String(err),
      warnings,
    };
  }
}

async function syncOneSource(
  sourceId: string,
  force: boolean
): Promise<KnowledgeSyncSourceResult> {
  const source = getKnowledgeSource(sourceId);
  if (!source || !source.enabled) {
    return {
      sourceId,
      ok: false,
      skipped: false,
      chunks: 0,
      error: "Source not found or disabled",
      warnings: [],
    };
  }

  const url = source.url ?? "";

  switch (source.product) {
    case "csap":
      return syncCywareProduct("csap", sourceId, url, force);
    case "cftr":
      return syncCywareProduct("cftr", sourceId, url, force);
    case "ctix":
      return syncCywareProduct("ctix", sourceId, url, force);
    case "orchestrate":
      return syncCywareProduct("orchestrate", sourceId, url, force);
    case "cql":
      return syncCql(sourceId, url, force);
    case "confluence":
      return syncConfluence(sourceId, force);
    case "zendesk":
      return syncZendesk(sourceId, force);
    case "support_docs":
      return syncSupportDocs(sourceId, url, force);
    default:
      return {
        sourceId,
        ok: false,
        skipped: false,
        chunks: 0,
        error: "Unsupported source product",
        warnings: [],
      };
  }
}

/** Download, parse, chunk, embed, and upsert configured knowledge sources. */
export async function runKnowledgeSync(input: {
  triggeredBy: "manual" | "scheduled" | "startup";
  sourceIds?: string[];
  force?: boolean;
}): Promise<KnowledgeSyncResult> {
  const timer = metrics.startTimer("knowledge.sync", "knowledge", {
    metadata: { triggeredBy: input.triggeredBy },
  });
  const enabled = listEnabledKnowledgeSources();
  const targetIds =
    input.sourceIds?.length
      ? input.sourceIds.filter((id) => enabled.some((s) => s.id === id))
      : enabled.map((s) => s.id);

  const run = await createKnowledgeSyncRun({
    triggeredBy: input.triggeredBy,
    sourceIds: targetIds,
  });

  const sources: KnowledgeSyncSourceResult[] = [];
  for (const sourceId of targetIds) {
    const result = await syncOneSource(sourceId, Boolean(input.force));
    sources.push(result);
    if (result.ok) {
      if (result.skipped) run.skippedUnchangedCount += 1;
      else {
        run.downloadedCount += 1;
        run.parsedCount += 1;
        run.chunkCount += result.chunks;
        run.embeddedCount += result.chunks;
        run.upsertedCount += result.chunks;
      }
    } else {
      run.failedCount += 1;
    }
  }

  const status =
    run.failedCount === 0
      ? "completed"
      : run.failedCount === targetIds.length
        ? "failed"
        : "partial";

  const errorSummary =
    run.failedCount > 0
      ? sources
          .filter((s) => s.error)
          .map((s) => `${s.sourceId}: ${s.error}`)
          .join("; ")
          .slice(0, 500)
      : undefined;

  const completed = await finishKnowledgeSyncRun(run, status, errorSummary);
  timer.end({
    success: status !== "failed",
    metadata: {
      runId: completed.id,
      status: completed.status,
      sourceCount: targetIds.length,
      upsertedCount: completed.upsertedCount,
      failedCount: completed.failedCount,
    },
  });
  return { run: completed, sources };
}
