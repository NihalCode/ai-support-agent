/**
 * Internal API registry schema — normalized view of every imported endpoint.
 */
import type { NormalizedApiSpec, NormalizedEndpoint } from "@/lib/support/types";

export interface ApiRegistryEntry {
  id: string;
  productName: string;
  sourceName: string;
  sourceKind: string;
  specId: string;
  endpointPath: string;
  method: string;
  name: string;
  description: string;
  authType: string;
  requiredCredentials: string[];
  headers: { name: string; required: boolean }[];
  queryParams: { name: string; required: boolean; description?: string }[];
  pathParams: { name: string; required: boolean }[];
  requestBodySchema?: string;
  responseSchema?: string;
  examples: string[];
  errorCodes: string[];
  rateLimits?: string;
  pagination?: string;
  cqlSupport: boolean;
  relatedEndpoints: string[];
  docsUrl?: string;
  importedAt: string;
  version?: string;
  runnable: boolean;
}

export function entryFromEndpoint(spec: NormalizedApiSpec, ep: NormalizedEndpoint): ApiRegistryEntry {
  const hay = `${ep.name} ${ep.description} ${ep.path}`.toLowerCase();
  return {
    id: `${spec.id}:${ep.method}:${ep.path}`.replace(/\s+/g, "_"),
    productName: spec.name,
    sourceName: spec.id,
    sourceKind: spec.sourceKind,
    specId: spec.id,
    endpointPath: ep.path,
    method: ep.method,
    name: ep.name,
    description: ep.description ?? "",
    authType: spec.authType,
    requiredCredentials: authCredentialsFor(spec.authType),
    headers: ep.headersRequired.map((h) => ({ name: h.name, required: true })),
    queryParams: ep.queryParams.map((p) => ({
      name: p.name,
      required: p.required,
      description: p.description,
    })),
    pathParams: ep.pathParams.map((p) => ({ name: p.name, required: p.required })),
    requestBodySchema: ep.requiredFields.length ? JSON.stringify(ep.requiredFields) : undefined,
    examples: ep.examples?.slice(0, 2).map((e) => e.request ?? e.name ?? "").filter(Boolean) ?? [],
    errorCodes: ep.responses.filter((r) => r.isError).map((r) => r.status),
    cqlSupport: /\bcql\b|query_string|indicator_type/i.test(hay),
    relatedEndpoints: [],
    docsUrl: spec.sourceUrl,
    importedAt: spec.createdAt ?? new Date().toISOString(),
    version: undefined,
    runnable: Boolean(spec.baseUrl),
  };
}

function authCredentialsFor(authType: string): string[] {
  switch (authType) {
    case "ctix_open_api":
      return ["AccessID", "SecretKey", "Signature", "Expires"];
    case "basic":
      return ["username", "password"];
    case "bearer":
      return ["API token"];
    case "api_key":
    default:
      return ["API key"];
  }
}

export type { NormalizedApiSpec, NormalizedEndpoint };
