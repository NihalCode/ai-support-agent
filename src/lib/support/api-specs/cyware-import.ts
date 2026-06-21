import "server-only";

import type { CywareProductId } from "../cyware-products";
import {
  CYWARE_PRODUCT_PRESETS,
  getCywareProductPreset,
} from "../cyware-products";
import { ingestTheneoDocs } from "./theneo";
import { ingestPostmanDocumenter } from "./postman-documenter";
import { indexSpec, registerSpec } from "./registry";
import type { NormalizedApiSpec } from "../types";

export interface CywareProductImportResult {
  productId: CywareProductId;
  spec: NormalizedApiSpec;
  indexed: { namespace: string; chunks: number; usedMockStore: boolean; usedOpenAI: boolean } | null;
  warnings: string[];
  detail: string;
}

/** One-click import for a built-in Cyware product (CSAP, CFTR, Orchestrate, CTIX). */
export async function importCywareProduct(
  productId: CywareProductId,
  opts: { index?: boolean; maxPages?: number } = {}
): Promise<CywareProductImportResult> {
  const preset = getCywareProductPreset(productId);
  if (!preset) throw new Error(`Unknown Cyware product: ${productId}`);

  const warnings: string[] = [];
  let spec: NormalizedApiSpec;

  if (preset.importStrategy === "theneo" && preset.theneo) {
    const result = await ingestTheneoDocs({
      origin: preset.theneo.origin,
      project: preset.theneo.project,
      llmsPath: preset.theneo.llmsPath,
      name: preset.name,
      maxPages: opts.maxPages,
    });
    spec = result.spec;
    spec.id = preset.specId;
    warnings.push(...result.warnings);
    if (spec.endpoints.length === 0) {
      throw new Error(
        `No endpoints extracted from ${preset.name} docs. The site may block server fetches — try importing an OpenAPI/Postman file manually.`
      );
    }
  } else if (preset.importStrategy === "postman-documenter" && preset.postmanDocumenter) {
    const result = await ingestPostmanDocumenter(preset.postmanDocumenter.collectionUrl, preset.name);
    spec = result.spec;
    spec.id = preset.specId;
  } else {
    throw new Error(`No import strategy for ${productId}`);
  }

  registerSpec(spec);

  let indexed = null;
  if (opts.index !== false) {
    indexed = await indexSpec(spec);
  }

  return {
    productId,
    spec,
    indexed,
    warnings,
    detail: `Imported ${spec.endpoints.length} endpoints for ${preset.name}`,
  };
}

export function listCywareProductImportStatus(): {
  id: CywareProductId;
  name: string;
  docsSiteUrl: string;
  specId: string;
  importStrategy: string;
}[] {
  return Object.values(CYWARE_PRODUCT_PRESETS).map((p) => ({
    id: p.id,
    name: p.name,
    docsSiteUrl: p.docsSiteUrl,
    specId: p.specId,
    importStrategy: p.importStrategy,
  }));
}
