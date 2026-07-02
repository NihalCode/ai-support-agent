import "server-only";

import type { CywareProductId } from "./cyware-products";
import { CYWARE_PRODUCT_PRESETS, envPrefixForProduct } from "./cyware-products";
import { getCywareProductConnector } from "./connectors/cyware-product";
import { getConfig } from "./config";
import type { NormalizedApiSpec } from "./types";
import type { InvestigationContext, SupportQuery } from "./investigation/types";

/** Map a registered spec id/name to a Cyware product connector when applicable. */
export function productForSpec(spec: Pick<NormalizedApiSpec, "id" | "name">): CywareProductId | null {
  const id = spec.id.toLowerCase();
  if (/ctix|intel.exchange/i.test(id) || /ctix/i.test(spec.name)) return "ctix";
  if (/csap/i.test(id) || /csap/i.test(spec.name)) return "csap";
  if (/cftr/i.test(id) || /cftr/i.test(spec.name)) return "cftr";
  if (/orchestrate/i.test(id) || /orchestrate/i.test(spec.name)) return "orchestrate";
  return null;
}

export function productForSpecId(specId: string): CywareProductId | null {
  const preset = Object.values(CYWARE_PRODUCT_PRESETS).find((p) => p.specId === specId);
  return preset?.id ?? null;
}

/** Configured tenant base URL for a product (no trailing slash), or null when unset. */
export function configuredProductBaseUrl(productId: CywareProductId): string | null {
  const conn = getCywareProductConnector(productId);
  if (!conn.configured) return null;
  const base = getConfig().cywareProducts[productId].baseUrl;
  return base ? base.replace(/\/$/, "") : null;
}

/** Resolve Postman-style {{base_url}} placeholders into a full tenant URL. */
export function resolvePathWithBase(path: string, baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const trimmed = path.trim();

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\{\{base_url\}\}/gi, base);
  }

  let relative = trimmed.replace(/\{\{base_url\}\}/gi, "");
  if (!relative.startsWith("/")) relative = `/${relative}`;
  return `${base}${relative}`;
}

export function parseEndpointField(endpoint: string): { method?: string; path: string } {
  const m = endpoint.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(.+)$/i);
  if (m) return { method: m[1]!.toUpperCase(), path: m[2]!.trim() };
  return { path: endpoint.trim() };
}

/** Best-effort product guess from an API path when the query text is ambiguous. */
export function guessProductFromPath(path: string): CywareProductId | null {
  if (/\{\{base_url\}\}/i.test(path)) return "cftr";
  if (/\/v3\//i.test(path) || /\/rest-auth\//i.test(path)) return "ctix";
  if (/playbook|node-result|test_connectivity|release_version/i.test(path)) return "orchestrate";
  if (/create_card|alert_update|csap/i.test(path)) return "csap";
  if (/^\/v1\//i.test(path) && /incident|cftr|action/i.test(path)) return "cftr";
  return null;
}

export function productIdForQueryEndpoint(
  query: SupportQuery,
  ctx?: Partial<InvestigationContext>,
  detectedProducts: CywareProductId[] = []
): CywareProductId | null {
  const endpoint = query.endpoint ?? "";
  const { path } = parseEndpointField(endpoint);
  const fromText = detectedProducts;

  if (/\{\{base_url\}\}/i.test(path)) return "cftr";

  const docProduct = ctx?.docs?.docs
    ?.map((d) => productForSpecId(String(d.metadata?.repo ?? "")))
    .find(Boolean);
  if (docProduct && (fromText.length === 0 || fromText.includes(docProduct))) return docProduct;

  if (fromText.length === 1) return fromText[0]!;

  const fromPath = guessProductFromPath(path);
  if (fromPath && (fromText.length === 0 || fromText.includes(fromPath))) return fromPath;

  if (fromText.includes("orchestrate") && /playbook|node-result/i.test(path)) return "orchestrate";
  if (fromText.includes("cftr") && /incident|v1\//i.test(path)) return "cftr";
  if (fromText.includes("ctix") && /\/v3\//i.test(path)) return "ctix";
  if (fromText.includes("csap") && /create_card|alert/i.test(path)) return "csap";

  return fromText[0] ?? fromPath;
}

/**
 * Format an API path for investigation UI — substitutes configured tenant base URLs
 * (CTIX, CFTR, Orchestrate, CSAP) instead of Postman {{base_url}} placeholders.
 */
export function formatApiEndpointDisplay(
  pathOrUrl: string,
  opts: { method?: string; productId?: CywareProductId | null; specId?: string } = {}
): string {
  const method = opts.method?.toUpperCase();
  let productId = opts.productId ?? null;
  if (!productId && opts.specId) productId = productForSpecId(opts.specId);

  const { path: parsedPath } = parseEndpointField(pathOrUrl);
  if (!productId) productId = guessProductFromPath(parsedPath);

  const pathOnly = parsedPath.replace(/^https?:\/\/[^/]+/i, "");

  if (productId) {
    const base = configuredProductBaseUrl(productId);
    if (base) {
      const full = resolvePathWithBase(pathOnly, base);
      return method ? `${method} ${full}` : full;
    }
    const envKey = `${envPrefixForProduct(productId)}_BASE_URL`;
    const relative = pathOnly.replace(/\{\{base_url\}\}/gi, "").replace(/^\//, "");
    const placeholder = `https://<${envKey}>/${relative}`;
    return method ? `${method} ${placeholder}` : placeholder;
  }

  if (/\{\{base_url\}\}/i.test(pathOnly)) {
    const relative = pathOnly.replace(/\{\{base_url\}\}/gi, "").replace(/^\//, "");
    const placeholder = `https://<CFTR_BASE_URL>/${relative}`;
    return method ? `${method} ${placeholder}` : placeholder;
  }

  return method ? `${method} ${pathOrUrl}` : pathOrUrl;
}

export function formatQueryEndpointDisplay(
  query: SupportQuery | undefined,
  ctx?: Partial<InvestigationContext>,
  detectedProducts: CywareProductId[] = []
): string {
  if (!query?.endpoint) return "—";
  const { method, path } = parseEndpointField(query.endpoint);
  const productId = productIdForQueryEndpoint(query, ctx, detectedProducts);
  return formatApiEndpointDisplay(path, { method, productId });
}

export function formatResolvedEndpointList(
  endpoints: string[],
  query: SupportQuery,
  ctx?: Partial<InvestigationContext>,
  detectedProducts: CywareProductId[] = []
): string[] {
  return endpoints.map((ep) => {
    const { method, path } = parseEndpointField(ep);
    const productId = productIdForQueryEndpoint({ ...query, endpoint: ep }, ctx, detectedProducts);
    return formatApiEndpointDisplay(path, { method, productId });
  });
}

/** Base URL used when building runnable API requests (throws if unset). */
export function resolveSpecBaseUrl(spec: NormalizedApiSpec): string {
  const productId = productForSpec(spec);
  if (productId) {
    const base = configuredProductBaseUrl(productId);
    if (base) return base;
  }
  if (spec.baseUrl && !/^https?:\/\/techdocs\./i.test(spec.baseUrl)) {
    return spec.baseUrl.replace(/\/$/, "");
  }
  throw new Error(
    `No base URL for spec "${spec.id}". Set the product env vars (e.g. ORCHESTRATE_BASE_URL) or ensure the spec defines baseUrl.`
  );
}
