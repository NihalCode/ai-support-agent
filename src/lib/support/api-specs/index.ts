import type {
  ApiSourceKind,
  NormalizedApiSpec,
  NormalizedEndpoint,
  SupportChunk,
} from "../types";
import { parseOpenApi, looksLikeOpenApi } from "./openapi";
import { parsePostman, looksLikePostman } from "./postman";
import { parseCurl, looksLikeCurl } from "./curl";
import { parseMarkdownApi } from "./markdown";
import { describeEndpoint } from "./normalize";
import { classifyHttp } from "../safety";

export { describeEndpoint } from "./normalize";

/**
 * Universal API source normalizer. Detects the source kind and dispatches to
 * the right parser, returning the common NormalizedApiSpec. Also converts a
 * spec's endpoints into RAG chunks (one per endpoint) with rich metadata.
 */

export function detectKind(content: string, hint?: ApiSourceKind): ApiSourceKind {
  if (hint) return hint;
  const head = content.trim().slice(0, 4000);
  if (looksLikePostman(head)) return "postman";
  if (looksLikeOpenApi(head)) return "openapi";
  if (looksLikeCurl(head)) return "curl";
  return "markdown";
}

export function normalizeApiSource(
  content: string,
  opts: { kind?: ApiSourceKind; name?: string; sourceUrl?: string } = {}
): NormalizedApiSpec {
  const kind = detectKind(content, opts.kind);
  let spec: NormalizedApiSpec;
  switch (kind) {
    case "postman":
      spec = parsePostman(content, opts.name);
      break;
    case "openapi":
    case "swagger":
      spec = parseOpenApi(content, opts.name);
      break;
    case "curl":
      spec = parseCurl(content, opts.name ?? "cURL import");
      break;
    case "markdown":
    case "manual":
    default:
      spec = parseMarkdownApi(content, opts.name ?? "API docs");
      break;
  }
  if (opts.sourceUrl) spec.sourceUrl = opts.sourceUrl;
  if (opts.name) spec.name = opts.name;
  return spec;
}

/** Namespace for an API spec in the vector store. */
export function apiSpecNamespace(specId: string): string {
  return `apispec:${specId}`.replace(/[^a-zA-Z0-9_@.:-]/g, "_");
}

/** Convert each endpoint into a retrievable chunk with endpoint metadata. */
export function chunkApiSpec(spec: NormalizedApiSpec): SupportChunk[] {
  const now = new Date().toISOString();
  return spec.endpoints.map((ep, idx) => {
    const text = [
      `API: ${spec.name}`,
      describeEndpoint(ep, spec.baseUrl),
      ep.group ? `Group: ${ep.group}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const sourceType = spec.sourceKind === "postman" ? "postman" : "openapi";
    return {
      id: `${apiSpecNamespace(spec.id)}:${ep.method}:${ep.path}:${idx}`.replace(/\s+/g, "_"),
      text,
      metadata: {
        repo: spec.id,
        branch: "api",
        filePath: `${ep.method} ${ep.path}`,
        language: "n/a",
        sourceType,
        title: ep.name,
        url: spec.sourceUrl,
        source_name: spec.name,
        source_url: spec.sourceUrl,
        endpoint_path: ep.path,
        http_method: ep.method,
        postman_request_name: spec.sourceKind === "postman" ? ep.name : undefined,
        created_at: now,
        updated_at: now,
      },
    };
  });
}

/** Find the most relevant endpoints in a spec for a natural-language query (lexical). */
export function rankEndpoints(
  spec: NormalizedApiSpec,
  query: string,
  limit = 5
): NormalizedEndpoint[] {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const scored = spec.endpoints.map((ep) => {
    const hay = `${ep.name} ${ep.description ?? ""} ${ep.path} ${ep.group ?? ""} ${ep.method}`.toLowerCase();
    let s = 0;
    for (const t of terms) if (hay.includes(t)) s += 1;
    return { ep, s };
  });
  return scored
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .filter((x) => x.s > 0 || spec.endpoints.length <= limit)
    .map((x) => x.ep);
}

/** Safety verdict for executing a normalized endpoint. */
export function endpointSafety(ep: NormalizedEndpoint, opts: { allowDestructive?: boolean } = {}) {
  return classifyHttp(ep.method, `${ep.name} ${ep.path} ${ep.effect}`, {
    allowDestructive: opts.allowDestructive,
  });
}
