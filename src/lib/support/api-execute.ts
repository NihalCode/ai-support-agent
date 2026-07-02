import "server-only";

import type { CywareProductId } from "./cyware-products";
import { getCywareProductConnector } from "./connectors/cyware-product";
import { productForSpec, resolveSpecBaseUrl } from "./api-base-url";
import { getSpec } from "./api-specs/registry";
import { classifyHttp } from "./safety";
import { redactHeaders } from "./redact";
import type { NormalizedApiSpec, NormalizedEndpoint, SafetyVerdict } from "./types";

export interface ApiRequestPlan {
  specId: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  redactedHeaders: Record<string, string>;
  body?: string;
  safety: SafetyVerdict;
  endpoint?: NormalizedEndpoint;
}

/** Map a spec id to a configured Cyware product connector when applicable. */
function productForSpecLocal(spec: NormalizedApiSpec): CywareProductId | null {
  return productForSpec(spec);
}

function resolveBaseUrl(spec: NormalizedApiSpec): string {
  return resolveSpecBaseUrl(spec);
}

function applySpecAuth(spec: NormalizedApiSpec, headers: Record<string, string>): Record<string, string> {
  const productId = productForSpecLocal(spec);
  if (productId) {
    const conn = getCywareProductConnector(productId);
    if (conn.configured) {
      return { ...headers, ...conn.getAuthHeaders() };
    }
  }
  return headers;
}

/** Build a previewable, safety-classified request for any registered API spec. */
export function buildSpecRequest(
  specId: string,
  method: string,
  path: string,
  opts: {
    query?: Record<string, string>;
    body?: unknown;
    summary?: string;
    allowDestructive?: boolean;
  } = {}
): ApiRequestPlan {
  const spec = getSpec(specId);
  if (!spec) throw new Error(`Spec not found: ${specId}. Import it first.`);

  const base = resolveBaseUrl(spec);
  const qs =
    opts.query && Object.keys(opts.query).length
      ? "?" + new URLSearchParams(opts.query).toString()
      : "";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${base}${normalizedPath}${qs}`;

  let headers: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
  headers = applySpecAuth(spec, headers);

  const body = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;
  const endpoint = spec.endpoints.find(
    (e) => e.method === method.toUpperCase() && e.path === normalizedPath
  );
  const safety = classifyHttp(method, opts.summary ?? endpoint?.description ?? `${method} ${path}`, {
    provider: productForSpecLocal(spec) ?? spec.id,
    allowDestructive: opts.allowDestructive,
  });

  return {
    specId,
    method: method.toUpperCase(),
    url,
    headers,
    redactedHeaders: redactHeaders(headers),
    body,
    safety,
    endpoint,
  };
}

/** Find an endpoint in a spec by natural-language query. */
export function findSpecEndpoint(specId: string, query: string): NormalizedEndpoint | null {
  const spec = getSpec(specId);
  if (!spec) return null;
  const q = query.toLowerCase();
  const ranked = spec.endpoints
    .map((e) => {
      const hay = `${e.name} ${e.description ?? ""} ${e.method} ${e.path}`.toLowerCase();
      let score = 0;
      for (const word of q.split(/\s+/).filter((w) => w.length > 2)) {
        if (hay.includes(word)) score += 1;
      }
      return { e, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.e ?? null;
}
