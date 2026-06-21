import "server-only";

import type { CywareProductId } from "./cyware-products";
import { configuredCywareProducts, getConfig, hasCywareProduct } from "./config";
import { getSpec, listSpecs } from "./api-specs/registry";
import { CYWARE_PRODUCT_PRESETS } from "./cyware-products";

/**
 * Unified API-provider registry. Each configured Cyware product (CTIX, CSAP,
 * CFTR, Orchestrate) appears alongside any imported API specs.
 */

export interface ApiProvider {
  id: string;
  name: string;
  kind: "cyware" | "spec";
  productId?: CywareProductId;
  baseUrl: string | null;
  authType: string;
  configured: boolean;
  endpoints: number;
  specId?: string;
  docsSiteUrl?: string;
}

export function listProviders(): ApiProvider[] {
  const cfg = getConfig();
  const providers: ApiProvider[] = [];
  const linkedSpecIds = new Set<string>();

  for (const productId of ["ctix", "csap", "cftr", "orchestrate"] as CywareProductId[]) {
    const preset = CYWARE_PRODUCT_PRESETS[productId];
    const pCfg = cfg.cywareProducts[productId];
    const spec =
      getSpec(preset.specId) ??
      listSpecs().find(
        (s) =>
          new RegExp(productId, "i").test(s.id) ||
          new RegExp(productId, "i").test(s.name) ||
          (productId === "ctix" && /cyware|ctix|intel/i.test(s.name))
      );

    if (spec) linkedSpecIds.add(spec.id);

    providers.push({
      id: productId,
      name: preset.name,
      kind: "cyware",
      productId,
      baseUrl: pCfg.baseUrl,
      authType: pCfg.authType,
      configured: hasCywareProduct(productId, cfg),
      endpoints: spec?.endpoints.length ?? 0,
      specId: spec?.id ?? preset.specId,
      docsSiteUrl: preset.docsSiteUrl,
    });
  }

  for (const spec of listSpecs()) {
    if (linkedSpecIds.has(spec.id)) continue;
    providers.push({
      id: spec.id,
      name: spec.name,
      kind: "spec",
      baseUrl: spec.baseUrl,
      authType: spec.authType,
      configured: Boolean(spec.baseUrl),
      endpoints: spec.endpoints.length,
      specId: spec.id,
    });
  }

  return providers;
}

export function configuredProviderCount(): number {
  return configuredCywareProducts().length;
}
