import type { NormalizedApiSpec, NormalizedEndpoint } from "../types";
import { effectForEndpoint, pathParamNames, specSlug } from "./normalize";

/**
 * Best-effort parser for Markdown / raw API documentation. Scans for
 * `METHOD /path` patterns (in headings, code spans, or prose) and builds an
 * endpoint per match, attaching the surrounding paragraph as the description.
 * This is intentionally lenient — it never throws and degrades gracefully.
 */

export function parseMarkdownApi(text: string, fallbackName = "API docs"): NormalizedApiSpec {
  const lines = text.split("\n");
  const endpoints: NormalizedEndpoint[] = [];
  const seen = new Set<string>();
  const methodRe = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b\s+(`?)(\/[A-Za-z0-9_\-./{}:]*)\2/;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(methodRe);
    if (!m) continue;
    const method = m[1].toUpperCase();
    const path = m[3];
    const key = `${method} ${path}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const context = lines.slice(i, Math.min(lines.length, i + 6)).join("\n");
    endpoints.push({
      name: stripMd(lines[i]).slice(0, 120) || key,
      description: stripMd(context).slice(0, 400),
      method,
      path,
      headersRequired: [],
      headersOptional: [],
      pathParams: pathParamNames(path).map((n) => ({ name: n, location: "path" as const, required: true })),
      queryParams: [],
      requiredFields: [],
      optionalFields: [],
      responses: [],
      effect: effectForEndpoint(method, context),
    });
  }

  const baseUrl = text.match(/https?:\/\/[A-Za-z0-9.\-]+(?:\/[A-Za-z0-9_\-./]*)?/)?.[0] ?? null;

  return {
    id: specSlug(fallbackName),
    name: fallbackName,
    baseUrl,
    authType: /bearer|authorization|api[-_\s]?key/i.test(text) ? "bearer" : "none",
    sourceKind: "markdown",
    endpoints,
    createdAt: new Date().toISOString(),
  };
}

function stripMd(s: string): string {
  return s.replace(/[#`*_>]/g, "").trim();
}
