import "server-only";

import { retrieveApiEndpointContext, detectCywareProducts } from "@/lib/support/api-context";
import { formatApiEndpointDisplay, formatResolvedEndpointList } from "@/lib/support/api-base-url";
import { CYWARE_PRODUCT_PRESETS } from "@/lib/support/cyware-products";
import type { SupportQuery } from "./types";
import { buildSearchTerms, isCqlAuthoringRequest } from "./extract-query";

function endpointFromChunk(metadata: Record<string, unknown>): string {
  const method = String(metadata.http_method ?? metadata.filePath ?? "GET").split(" ")[0] ?? "GET";
  const path =
    String(metadata.endpoint_path ?? "") ||
    String(metadata.filePath ?? "").replace(/^[A-Z]+\s+/, "");
  return `${method.toUpperCase()} ${path}`.trim();
}

/** Infer likely API endpoints from imported specs when the user did not provide one. */
export function inferEndpointsFromDocs(query: SupportQuery): string[] {
  if (query.endpoint) return [query.endpoint];

  const searchText = buildSearchTerms(query);
  const chunks = retrieveApiEndpointContext(searchText, 5);
  if (chunks.length === 0) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const chunk of chunks) {
    const meta = chunk.metadata as unknown as Record<string, unknown>;
    const ep = endpointFromChunk(meta);
    if (seen.has(ep)) continue;
    seen.add(ep);
    out.push(ep);
  }
  return out;
}

/** Enrich query with inferred endpoint(s) for agent search — does not overwrite explicit endpoint. */
export function enrichWithEndpointInference(query: SupportQuery): SupportQuery {
  if (isCqlAuthoringRequest(query.text ?? "", query)) return query;
  if (query.endpoint) return query;

  const inferred = inferEndpointsFromDocs(query);
  if (inferred.length === 0) return query;

  return {
    ...query,
    inferredEndpoints: inferred,
    endpoint: inferred[0],
    feature: query.feature ?? query.workflowName,
  };
}

export function describeEndpointInference(query: SupportQuery): string | null {
  if (query.endpoint && !query.inferredEndpoints?.length) return null;
  const inferred = query.inferredEndpoints ?? inferEndpointsFromDocs(query);
  if (inferred.length === 0) {
    if (query.workflowName || query.likelyCategory) {
      return "I don't have the exact endpoint yet, but based on your description I'm checking imported API docs for related workflows and actions.";
    }
    return null;
  }
  const resolved = formatResolvedEndpointList(
    inferred.slice(0, 3),
    query,
    undefined,
    detectCywareProducts(query.text ?? "")
  );
  return `Based on your description I'm checking imported API docs — likely endpoints include ${resolved.join(", ")}.`;
}

/** Format a single endpoint line for docs/evidence (method + tenant URL). */
export function formatInferredEndpointDisplay(
  method: string,
  path: string,
  specId?: string
): string {
  const productId = specId
    ? Object.values(CYWARE_PRODUCT_PRESETS).find((p) => p.specId === specId)?.id ?? null
    : null;
  return formatApiEndpointDisplay(path, { method, productId, specId });
}
