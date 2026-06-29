import "server-only";

import { listSpecs } from "@/lib/support/api-specs/registry";
import { importCywareProduct } from "@/lib/support/api-specs/cyware-import";
import { loadBundledCywareSpec } from "@/lib/support/api-specs/bundled-specs";
import { registerSpec, indexSpec } from "@/lib/support/api-specs/registry";
import { CYWARE_PRODUCT_PRESETS, type CywareProductId } from "@/lib/support/cyware-products";
import { ingestCqlDocs } from "@/lib/support/cql/ingest-docs";
import { ingestEnterpriseKnowledge } from "@/lib/support/enterprise/knowledge-ingest";

const g = globalThis as unknown as { __autoImportDone?: boolean; __autoImportPromise?: Promise<AutoImportResult> };

export interface AutoImportResult {
  cywareProducts: { id: CywareProductId; endpoints: number; source: string }[];
  cql: { chunks: number; skipped: boolean };
  enterpriseKnowledge: { chunks: number; skipped: boolean };
  warnings: string[];
  durationMs: number;
}

/** Auto-import bundled Cyware API specs + CQL docs when registry is empty. */
export async function ensureAutoImported(): Promise<AutoImportResult> {
  if (g.__autoImportDone && !g.__autoImportPromise) {
    return {
      cywareProducts: [],
      cql: { chunks: 0, skipped: true },
      enterpriseKnowledge: { chunks: 0, skipped: true },
      warnings: [],
      durationMs: 0,
    };
  }
  if (g.__autoImportPromise) return g.__autoImportPromise;

  g.__autoImportPromise = runAutoImport();
  const result = await g.__autoImportPromise;
  g.__autoImportDone = true;
  return result;
}

async function runAutoImport(): Promise<AutoImportResult> {
  const start = Date.now();
  const warnings: string[] = [];
  const cywareProducts: AutoImportResult["cywareProducts"] = [];
  const existing = listSpecs();
  const productIds = Object.keys(CYWARE_PRODUCT_PRESETS) as CywareProductId[];

  for (const id of productIds) {
    const preset = CYWARE_PRODUCT_PRESETS[id];
    const already = existing.some((s) => s.id === preset.specId);
    if (already) {
      const spec = existing.find((s) => s.id === preset.specId)!;
      cywareProducts.push({ id, endpoints: spec.endpoints.length, source: "cached" });
      continue;
    }

    try {
      const live = process.env.AUTO_IMPORT_LIVE_CYWARE === "true";
      if (live) {
        const result = await importCywareProduct(id, { index: true });
        cywareProducts.push({ id, endpoints: result.spec.endpoints.length, source: result.source });
        warnings.push(...result.warnings);
      } else {
        const bundled = loadBundledCywareSpec(id);
        if (bundled && bundled.endpoints.length > 0) {
          const spec = { ...bundled, id: preset.specId };
          registerSpec(spec);
          await indexSpec(spec);
          cywareProducts.push({ id, endpoints: spec.endpoints.length, source: "bundled-auto" });
        } else {
          warnings.push(`No bundled spec for ${id} — set AUTO_IMPORT_LIVE_CYWARE=true to fetch live.`);
        }
      }
    } catch (err) {
      warnings.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  let cqlChunks = 0;
  let cqlSkipped = true;
  if (process.env.AUTO_IMPORT_CQL !== "false") {
    try {
      const store = await import("@/lib/support/vector-store").then((m) => m.getVectorStore());
      const ns = (await import("@/lib/support/cql/ingest-docs")).cqlNamespace();
      const existingCql = await store.query(ns, new Array(8).fill(0), 1);
      if (existingCql.length === 0) {
        const cql = await ingestCqlDocs();
        cqlChunks = cql.chunks;
        cqlSkipped = false;
        warnings.push(...cql.warnings);
      }
    } catch (err) {
      warnings.push(`CQL auto-import: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  let enterpriseKnowledgeChunks = 0;
  let enterpriseKnowledgeSkipped = true;
  if (process.env.AUTO_IMPORT_ENTERPRISE_KNOWLEDGE !== "false") {
    try {
      const { enterpriseKnowledgeNamespace } = await import(
        "@/lib/support/enterprise/knowledge-ingest"
      );
      const store = await import("@/lib/support/vector-store").then((m) => m.getVectorStore());
      const ns = enterpriseKnowledgeNamespace();
      const existing = await store.query(ns, new Array(8).fill(0), 1);
      if (existing.length === 0) {
        const knowledge = await ingestEnterpriseKnowledge();
        enterpriseKnowledgeChunks = knowledge.upserted;
        enterpriseKnowledgeSkipped = false;
        warnings.push(...knowledge.warnings);
      }
    } catch (err) {
      warnings.push(
        `Enterprise knowledge auto-import: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return {
    cywareProducts,
    cql: { chunks: cqlChunks, skipped: cqlSkipped },
    enterpriseKnowledge: {
      chunks: enterpriseKnowledgeChunks,
      skipped: enterpriseKnowledgeSkipped,
    },
    warnings,
    durationMs: Date.now() - start,
  };
}
