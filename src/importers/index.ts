/**
 * Unified API import facade — wraps parsers in src/lib/support/api-specs/
 * and CQL ingest. Use this from routes, bootstrap, and MCP importers.
 */
export { detectSource, type DetectedSourceType, type SourceDetectionResult } from "./sourceDetector";
export { crawlDocsUrl, type DocsCrawlResult } from "./docsCrawler";
export * from "./postmanImporter";
export * from "./openApiImporter";
export * from "./cqlImporter";

import type { NormalizedApiSpec } from "@/lib/support/types";
import { normalizeApiSource } from "@/lib/support/api-specs";
import { indexSpec, registerSpec } from "@/lib/support/api-specs/registry";
import { importCywareProduct } from "@/lib/support/api-specs/cyware-import";
import type { CywareProductId } from "@/lib/support/cyware-products";
import { ingestCqlDocs } from "@/lib/support/cql/ingest-docs";
import { detectSource } from "./sourceDetector";
import { crawlDocsUrl } from "./docsCrawler";

export interface ImportPipelineResult {
  kind: string;
  spec?: NormalizedApiSpec;
  indexed?: { namespace: string; chunks: number } | null;
  cql?: { chunks: number; pagesFetched: number };
  warnings: string[];
}

/** End-to-end import: detect → parse → register → embed → Pinecone. */
export async function runImportPipeline(input: {
  content?: string;
  url?: string;
  name?: string;
  cywareProduct?: CywareProductId;
  index?: boolean;
}): Promise<ImportPipelineResult> {
  const warnings: string[] = [];
  const index = input.index !== false;

  if (input.cywareProduct) {
    const result = await importCywareProduct(input.cywareProduct, { index });
    return {
      kind: "cyware-product",
      spec: result.spec,
      indexed: result.indexed ? { namespace: result.indexed.namespace, chunks: result.indexed.chunks } : null,
      warnings: result.warnings,
    };
  }

  const detected = detectSource({ url: input.url, content: input.content });
  if (detected.kind === "cql-docs" && input.url) {
      const cql = await ingestCqlDocs(input.url);
    return {
      kind: "cql-docs",
      cql: { chunks: cql.chunks, pagesFetched: cql.pagesFetched },
      warnings: cql.warnings,
    };
  }

  if (input.url && !input.content) {
    const crawled = await crawlDocsUrl(input.url, { name: input.name });
    warnings.push(...crawled.warnings);
    if (!crawled.spec) throw new Error("No spec produced from URL");
    registerSpec(crawled.spec);
    const indexed = index ? await indexSpec(crawled.spec) : null;
    return {
      kind: crawled.sourceKind,
      spec: crawled.spec,
      indexed: indexed ? { namespace: indexed.namespace, chunks: indexed.chunks } : null,
      warnings,
    };
  }

  const content = input.content?.trim();
  if (!content) throw new Error("Provide content, url, or cywareProduct");

  const spec = normalizeApiSource(content, { name: input.name, sourceUrl: input.url });
  registerSpec(spec);
  const indexed = index ? await indexSpec(spec) : null;
  return {
    kind: spec.sourceKind,
    spec,
    indexed: indexed ? { namespace: indexed.namespace, chunks: indexed.chunks } : null,
    warnings,
  };
}
