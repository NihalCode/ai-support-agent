import "server-only";

import type { CywareProductId } from "../cyware-products";
import {
  CYWARE_PRODUCT_PRESETS,
  getCywareProductPreset,
} from "../cyware-products";
import { ingestTheneoDocs } from "./theneo";
import { ingestPostmanDocumenter } from "./postman-documenter";
import { loadBundledCywareSpec } from "./bundled-specs";
import { indexSpec, registerSpec } from "./registry";
import type { NormalizedApiSpec } from "../types";

export interface CywareProductImportResult {
  productId: CywareProductId;
  spec: NormalizedApiSpec;
  indexed: { namespace: string; chunks: number; usedMockStore: boolean; usedOpenAI: boolean } | null;
  warnings: string[];
  detail: string;
  source: "live" | "bundled";
}

/** One-click import for a built-in Cyware product (CSAP, CFTR, Orchestrate, CTIX). */
export async function importCywareProduct(
  productId: CywareProductId,
  opts: { index?: boolean; maxPages?: number; forceLive?: boolean } = {}
): Promise<CywareProductImportResult> {
  const preset = getCywareProductPreset(productId);
  if (!preset) throw new Error(`Unknown Cyware product: ${productId}`);

  const warnings: string[] = [];
  let spec: NormalizedApiSpec;
  let source: "live" | "bundled" = "live";

  try {
    if (preset.importStrategy === "theneo" && preset.theneo) {
      const result = await ingestTheneoDocs({
        origin: preset.theneo.origin,
        project: preset.theneo.project,
        llmsPath: preset.theneo.llmsPath,
        llmsPaths: preset.theneo.llmsPaths,
        referer: preset.docsSiteUrl,
        name: preset.name,
        maxPages: productId === "ctix" ? 200 : opts.maxPages ?? 300,
      });
      spec = result.spec;
      spec.id = preset.specId;
      warnings.push(...result.warnings);
      if (spec.endpoints.length === 0) {
        throw new Error(`No endpoints extracted from live ${preset.name} docs.`);
      }
    } else if (preset.importStrategy === "postman-documenter" && preset.postmanDocumenter) {
      const result = await ingestPostmanDocumenter(preset.postmanDocumenter.collectionUrl, preset.name);
      spec = result.spec;
      spec.id = preset.specId;
    } else {
      throw new Error(`No import strategy for ${productId}`);
    }
  } catch (liveErr) {
    if (opts.forceLive) throw liveErr;
    const bundled = loadBundledCywareSpec(productId);
    if (!bundled || bundled.endpoints.length === 0) {
      throw liveErr;
    }
    spec = { ...bundled, id: preset.specId };
    source = "bundled";
    warnings.push(
      `Live doc fetch failed (${liveErr instanceof Error ? liveErr.message : String(liveErr)}). ` +
        `Loaded bundled spec (${bundled.endpoints.length} endpoints). Run npm run vendor:cyware-specs to refresh.`
    );
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
    source,
    detail: `Imported ${spec.endpoints.length} endpoints for ${preset.name} (${source})`,
  };
}

export function listCywareProductImportStatus(): {
  id: CywareProductId;
  name: string;
  docsSiteUrl: string;
  specId: string;
  importStrategy: string;
  bundled: boolean;
}[] {
  return Object.values(CYWARE_PRODUCT_PRESETS).map((p) => ({
    id: p.id,
    name: p.name,
    docsSiteUrl: p.docsSiteUrl,
    specId: p.specId,
    importStrategy: p.importStrategy,
    bundled: existsBundled(p.id),
  }));
}

function existsBundled(id: CywareProductId): boolean {
  try {
    return loadBundledCywareSpec(id) !== null;
  } catch {
    return false;
  }
}
