import "server-only";

import { safeFetch } from "../../ssrf";
import type { NormalizedApiSpec, NormalizedEndpoint } from "../types";
import { effectForEndpoint, pathParamNames, specSlug } from "./normalize";
import { parseMarkdownApi } from "./markdown";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface TheneoIngestOptions {
  origin: string;
  project: string;
  llmsPath?: string;
  name?: string;
  /** Cap pages fetched (Theneo exports can be large). */
  maxPages?: number;
}

export interface TheneoIngestResult {
  spec: NormalizedApiSpec;
  pagesFetched: number;
  pagesTotal: number;
  warnings: string[];
}

/** Fetch a Theneo llms.txt index + per-page .md exports and build a NormalizedApiSpec. */
export async function ingestTheneoDocs(opts: TheneoIngestOptions): Promise<TheneoIngestResult> {
  const warnings: string[] = [];
  const llmsPath = opts.llmsPath ?? `/${opts.project}/llms.txt`;
  const indexUrl = `${opts.origin.replace(/\/$/, "")}${llmsPath}`;

  const indexRes = await safeFetch(indexUrl, {
    headers: { Accept: "text/plain,*/*", "User-Agent": BROWSER_UA },
  });
  if (!indexRes.ok) {
    throw new Error(`Theneo index fetch failed (${indexRes.status}): ${indexUrl}`);
  }

  const mdPaths = indexRes.text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.endsWith(".md"));

  const maxPages = opts.maxPages ?? 300;
  const toFetch = mdPaths.slice(0, maxPages);
  if (mdPaths.length > maxPages) {
    warnings.push(`Indexed only first ${maxPages} of ${mdPaths.length} doc pages.`);
  }

  const endpoints: NormalizedEndpoint[] = [];
  const seen = new Set<string>();
  const markdownParts: string[] = [];

  const concurrency = 8;
  for (let i = 0; i < toFetch.length; i += concurrency) {
    const batch = toFetch.slice(i, i + concurrency);
    const pages = await Promise.all(
      batch.map(async (rel) => {
        const url = `${opts.origin.replace(/\/$/, "")}/${opts.project}/${rel.replace(/^\//, "")}`;
        try {
          const res = await safeFetch(url, {
            headers: { Accept: "text/html,text/plain,*/*", "User-Agent": BROWSER_UA },
          });
          if (!res.ok) return null;
          return { rel, text: extractTheneoPage(res.text) };
        } catch {
          return null;
        }
      })
    );
    for (const page of pages) {
      if (!page?.text) continue;
      markdownParts.push(page.text);
      for (const ep of endpointsFromTheneoText(page.text)) {
        const key = `${ep.method} ${ep.path}`;
        if (seen.has(key)) continue;
        seen.add(key);
        endpoints.push(ep);
      }
    }
  }

  if (endpoints.length === 0 && markdownParts.length > 0) {
    const mdSpec = parseMarkdownApi(markdownParts.join("\n\n"), opts.name ?? opts.project);
    endpoints.push(...mdSpec.endpoints);
    warnings.push("Used markdown fallback parser for endpoint extraction.");
  }

  const name = opts.name ?? opts.project.replace(/-/g, " ");
  const spec: NormalizedApiSpec = {
    id: specSlug(name),
    name,
    baseUrl: guessBaseUrl(markdownParts.join("\n")) ?? opts.origin,
    authType: /api[-_\s]?key|bearer|authorization/i.test(markdownParts.join("\n")) ? "api_key" : "none",
    sourceKind: "markdown",
    sourceUrl: indexUrl,
    endpoints,
    createdAt: new Date().toISOString(),
  };

  return { spec, pagesFetched: toFetch.length, pagesTotal: mdPaths.length, warnings };
}

/** Extract inner text from a Theneo .md HTML export (single <pre> block). */
export function extractTheneoPage(html: string): string {
  const m = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (!m) return decodeEntities(html.replace(/<[^>]+>/g, " "));
  return decodeEntities(m[1]);
}

function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Parse endpoint blocks from Theneo pre content (JSON or METHOD /path lines). */
function endpointsFromTheneoText(text: string): NormalizedEndpoint[] {
  const out: NormalizedEndpoint[] = [];

  // JSON endpoint export: { "method": "GET", "path": "/v3/..." }
  const jsonRe = /"method"\s*:\s*"(GET|POST|PUT|PATCH|DELETE)"[\s\S]*?"path"\s*:\s*"([^"]+)"/gi;
  let jm: RegExpExecArray | null;
  while ((jm = jsonRe.exec(text)) !== null) {
    out.push(makeEndpoint(jm[1], jm[2], text.slice(Math.max(0, jm.index - 80), jm.index + 200)));
  }

  const methodRe = /\b(GET|POST|PUT|PATCH|DELETE)\b\s+(`?)(\/[A-Za-z0-9_\-./{}:]*)\2/g;
  let mm: RegExpExecArray | null;
  while ((mm = methodRe.exec(text)) !== null) {
    out.push(makeEndpoint(mm[1], mm[3], text.slice(mm.index, mm.index + 300)));
  }

  return out;
}

function makeEndpoint(method: string, path: string, context: string): NormalizedEndpoint {
  return {
    name: `${method} ${path}`.slice(0, 120),
    description: context.replace(/\s+/g, " ").slice(0, 400),
    method: method.toUpperCase(),
    path,
    headersRequired: [],
    headersOptional: [],
    pathParams: pathParamNames(path).map((n) => ({ name: n, location: "path" as const, required: true })),
    queryParams: [],
    requiredFields: [],
    optionalFields: [],
    responses: [],
    effect: effectForEndpoint(method, context),
  };
}

function guessBaseUrl(text: string): string | null {
  return text.match(/https?:\/\/[A-Za-z0-9.\-]+(?:\/[A-Za-z0-9_\-./]*)?/)?.[0] ?? null;
}

export function looksLikeTheneoUrl(url: string): boolean {
  return /cyware\.com/i.test(url) && /(api-reference|theneo|llms\.txt)/i.test(url);
}
