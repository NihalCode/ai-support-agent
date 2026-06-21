import "server-only";

import { safeFetch } from "../../ssrf";
import { withRetry } from "../retry";
import type { NormalizedApiSpec, NormalizedEndpoint, NormalizedParam } from "../types";
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

export interface LlmsEntry {
  title: string;
  url: string;
  description: string;
}

/** Parse a Theneo llms.txt index — markdown links to .md pages. */
export function parseLlmsIndex(text: string): LlmsEntry[] {
  const entries: LlmsEntry[] = [];
  const seen = new Set<string>();
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+?\.md)\)\s*:?\s*([^\n]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const url = m[2].trim();
    if (seen.has(url)) continue;
    seen.add(url);
    entries.push({ title: m[1].trim(), url, description: (m[3] || "").trim() });
  }

  // Fallback: bare .md paths on their own line.
  if (entries.length === 0) {
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      const bare = trimmed.match(/^(?:-\s*)?(\S+\.md)\s*$/);
      if (bare) {
        entries.push({ title: bare[1], url: bare[1], description: "" });
      }
    }
  }

  return entries;
}

/** Parse a Cyware/Theneo endpoint page (description + JSON block in <pre>). */
export function parseCywareEndpointPre(preText: string): {
  method: string;
  path: string;
  description: string;
  queryParams: NormalizedParam[];
  pathParams: NormalizedParam[];
} | null {
  const braceIdx = preText.indexOf("\n{");
  if (braceIdx === -1) return null;
  const description = preText.slice(0, braceIdx).trim();
  try {
    const spec = JSON.parse(preText.slice(braceIdx + 1)) as {
      endpoints?: { method?: string; path?: string };
      request?: {
        query?: Array<{ name: string; isRequired?: boolean; description?: string }>;
        path?: Array<{ name: string; isRequired?: boolean; description?: string }>;
      };
    };
    const ep = spec.endpoints;
    if (!ep?.method || !ep?.path) return null;
    const path = ep.path.startsWith("/") ? ep.path : `/${ep.path}`;
    return {
      method: ep.method.toUpperCase(),
      path,
      description,
      queryParams: (spec.request?.query ?? []).map((q) => ({
        name: q.name,
        location: "query" as const,
        required: q.isRequired === true,
        description: q.description,
      })),
      pathParams: (spec.request?.path ?? []).map((p) => ({
        name: p.name,
        location: "path" as const,
        required: p.isRequired !== false,
        description: p.description,
      })),
    };
  } catch {
    return null;
  }
}

async function fetchDoc(url: string): Promise<string | null> {
  try {
    const res = await withRetry(
      () =>
        safeFetch(url, {
          headers: {
            Accept: "text/html,text/plain,*/*",
            "User-Agent": BROWSER_UA,
          },
        }),
      { retries: 3, baseDelayMs: 400 }
    );
    if (!res.ok) return null;
    return res.text;
  } catch {
    return null;
  }
}

/** Fetch a Theneo llms.txt index + per-page .md exports and build a NormalizedApiSpec. */
export async function ingestTheneoDocs(opts: TheneoIngestOptions): Promise<TheneoIngestResult> {
  const warnings: string[] = [];
  const llmsPath = opts.llmsPath ?? `/${opts.project}/llms.txt`;
  const indexUrl = `${opts.origin.replace(/\/$/, "")}${llmsPath}`;

  const indexRes = await withRetry(
    () =>
      safeFetch(indexUrl, {
        headers: { Accept: "text/plain,*/*", "User-Agent": BROWSER_UA },
      }),
    { maxAttempts: 3, baseMs: 400 }
  );
  if (!indexRes.ok) {
    throw new Error(`Theneo index fetch failed (${indexRes.status}): ${indexUrl}`);
  }

  const entries = parseLlmsIndex(indexRes.text);
  if (entries.length === 0) {
    warnings.push("llms.txt contained no markdown .md links — index format may have changed.");
  }

  const maxPages = opts.maxPages ?? 600;
  const toFetch = entries.slice(0, maxPages);
  if (entries.length > maxPages) {
    warnings.push(`Indexed only first ${maxPages} of ${entries.length} doc pages.`);
  }

  const endpoints: NormalizedEndpoint[] = [];
  const seen = new Set<string>();
  const markdownParts: string[] = [];

  const concurrency = 10;
  for (let i = 0; i < toFetch.length; i += concurrency) {
    const batch = toFetch.slice(i, i + concurrency);
    const pages = await Promise.all(
      batch.map(async (entry) => {
        const url = entry.url.startsWith("http")
          ? entry.url
          : `${opts.origin.replace(/\/$/, "")}/${opts.project}/${entry.url.replace(/^\//, "")}`;
        const html = await fetchDoc(url);
        if (!html) return null;
        const text = extractTheneoPage(html);
        return { entry, text };
      })
    );

    for (const page of pages) {
      if (!page?.text) continue;
      markdownParts.push(page.text);

      const parsed = parseCywareEndpointPre(page.text);
      if (parsed) {
        const key = `${parsed.method} ${parsed.path}`;
        if (seen.has(key)) continue;
        seen.add(key);
        endpoints.push({
          name: page.entry.title || key,
          description: (parsed.description || page.entry.description).slice(0, 400),
          method: parsed.method,
          path: parsed.path,
          headersRequired: [],
          headersOptional: [],
          pathParams:
            parsed.pathParams.length > 0
              ? parsed.pathParams
              : pathParamNames(parsed.path).map((n) => ({ name: n, location: "path" as const, required: true })),
          queryParams: parsed.queryParams,
          requiredFields: [],
          optionalFields: [],
          responses: [],
          effect: effectForEndpoint(parsed.method, parsed.description),
        });
        continue;
      }

      for (const ep of endpointsFromTheneoText(page.text)) {
        const key = `${ep.method} ${ep.path}`;
        if (seen.has(key)) continue;
        seen.add(key);
        endpoints.push({ ...ep, name: page.entry.title || ep.name });
      }
    }
  }

  if (endpoints.length === 0 && markdownParts.length > 0) {
    const mdSpec = parseMarkdownApi(markdownParts.join("\n\n"), opts.name ?? opts.project);
    for (const ep of mdSpec.endpoints) {
      const key = `${ep.method} ${ep.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      endpoints.push(ep);
    }
    if (endpoints.length > 0) {
      warnings.push("Used markdown fallback parser for endpoint extraction.");
    }
  }

  if (endpoints.length === 0 && toFetch.length === 0) {
    warnings.push("No doc pages were fetched — the host may block server requests (403).");
  }

  const name = opts.name ?? opts.project.replace(/-/g, " ");
  const spec: NormalizedApiSpec = {
    id: specSlug(name),
    name,
    baseUrl: guessBaseUrl(markdownParts.join("\n")) ?? opts.origin,
    authType: /api[-_\s]?key|bearer|authorization|accessid|signature/i.test(markdownParts.join("\n"))
      ? "api_key"
      : "none",
    sourceKind: "markdown",
    sourceUrl: indexUrl,
    endpoints,
    createdAt: new Date().toISOString(),
  };

  return { spec, pagesFetched: toFetch.length, pagesTotal: entries.length, warnings };
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
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return {
    name: `${method} ${normalizedPath}`.slice(0, 120),
    description: context.replace(/\s+/g, " ").slice(0, 400),
    method: method.toUpperCase(),
    path: normalizedPath,
    headersRequired: [],
    headersOptional: [],
    pathParams: pathParamNames(normalizedPath).map((n) => ({ name: n, location: "path" as const, required: true })),
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
