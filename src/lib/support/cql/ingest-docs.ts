import "server-only";

import type { SupportChunk } from "../types";
import { getConfig } from "../config";
import { embedBatch } from "../embed";
import { getVectorStore } from "../vector-store";
import { safeFetch } from "../../ssrf";
import { withRetry } from "../retry";
import { cywareDocHeaders } from "../api-specs/cyware-fetch";

/**
 * Ingest Cyware Query Language (CQL) documentation into the vector store.
 * Techdocs serves CQL as multiple static HTML pages under /ctix/en/ — the
 * landing page alone is only ~15K chars; the full section is ~130K+ including
 * grammar and operators.
 */

export const DEFAULT_CQL_DOC_URL =
  "https://techdocs.cyware.com/ctix/en/cyware-query-language--cql-.html";

export const CQL_DOC_BASE = "https://techdocs.cyware.com/ctix/en/";

/** Known CQL pages on techdocs (always included). */
export const CQL_DOC_PAGES = [
  "cyware-query-language--cql-.html",
  "get-started-with-cql.html",
  "understand-cql-grammar.html",
  "apply-conditions-based-on-operators.html",
  "start-using-cql.html",
  "save-cql-queries.html",
  "cql-query-usecase.html",
] as const;

export function cqlNamespace(): string {
  const base = getConfig().pinecone.namespace;
  return (base ? `${base}__` : "") + "cql-docs";
}

export interface CqlIngestResult {
  url: string;
  fetchedChars: number;
  chunks: number;
  pagesFetched: number;
  pagesTotal: number;
  pageUrls: string[];
  usedMockStore: boolean;
  usedOpenAI: boolean;
  warnings: string[];
}

/** Discover additional CQL-related .html links from a techdocs page. */
export function discoverCqlPagePaths(html: string): string[] {
  const paths = new Set<string>(CQL_DOC_PAGES);
  const re = /href="([^"?#]*\.html)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim();
    if (/cql|CQL|operator/i.test(href) && !href.startsWith("http")) {
      paths.add(href.replace(/^\.\//, ""));
    }
  }
  return [...paths];
}

function pageUrl(path: string, base = CQL_DOC_BASE): string {
  if (path.startsWith("http")) return path;
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function extractPageTitle(html: string, fallback: string): string {
  const raw = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (!raw) return fallback;
  return decodeEntities(raw.replace(/\s*[-|]\s*Cyware.*$/i, "").trim()) || fallback;
}

async function fetchPage(url: string): Promise<string> {
  const res = await withRetry(
    () =>
      safeFetch(url, {
        headers: cywareDocHeaders(CQL_DOC_BASE),
      }),
    { retries: 2, baseDelayMs: 400 }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text;
}

export async function ingestCqlDocs(
  url = DEFAULT_CQL_DOC_URL,
  directContent?: string
): Promise<CqlIngestResult> {
  const warnings: string[] = [];
  let combinedText: string;
  let pageUrls: string[] = [url];
  let pagesFetched = directContent?.trim() ? 1 : 0;

  if (directContent?.trim()) {
    combinedText = directContent.trim();
  } else {
    const landingHtml = await fetchPage(url);
    const paths = discoverCqlPagePaths(landingHtml);
    pageUrls = paths.map((p) => pageUrl(p));

    const parts: string[] = [];
    for (const pagePath of paths) {
      const pageFullUrl = pageUrl(pagePath);
      try {
        const html = pagePath === paths[0] && url.endsWith(pagePath) ? landingHtml : await fetchPage(pageFullUrl);
        const title = extractPageTitle(html, pagePath.replace(/\.html$/, ""));
        const body = htmlToText(html);
        if (body.length < 100) {
          warnings.push(`Skipped thin page: ${pagePath} (${body.length} chars)`);
          continue;
        }
        parts.push(`## ${title}\nSource: ${pageFullUrl}\n\n${body}`);
        pagesFetched++;
      } catch (err) {
        warnings.push(`Could not fetch ${pagePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (parts.length === 0) {
      throw new Error("No CQL doc pages could be fetched.");
    }

    combinedText = parts.join("\n\n---\n\n");
    if (pagesFetched < paths.length) {
      warnings.push(`Fetched ${pagesFetched}/${paths.length} CQL doc pages.`);
    }
    if (combinedText.length < 20_000) {
      warnings.push(
        "Combined CQL text is smaller than expected (~130K+ for full docs). " +
          "Some pages may have been blocked — paste doc text directly if generation quality is poor."
      );
    }
  }

  const sections = splitSections(combinedText);
  const now = new Date().toISOString();
  const chunks: SupportChunk[] = sections.map((s, i) => ({
    id: `${cqlNamespace()}:${i}`,
    text: s.text,
    metadata: {
      repo: "cyware-cql",
      branch: "docs",
      filePath: `cql#${i}`,
      language: "text",
      sourceType: "cql-doc",
      title: s.heading,
      url: pageUrls[0] ?? url,
      source_name: "Cyware Query Language (CQL)",
      source_url: url,
      cyware_doc_section: s.heading,
      created_at: now,
      updated_at: now,
    },
  }));

  if (chunks.length === 0) {
    const store = getVectorStore();
    return {
      url,
      fetchedChars: combinedText.length,
      chunks: 0,
      pagesFetched,
      pagesTotal: pageUrls.length,
      pageUrls,
      usedMockStore: store.isMock,
      usedOpenAI: false,
      warnings,
    };
  }

  const { vectors, usedOpenAI } = await embedBatch(chunks.map((c) => c.text));
  chunks.forEach((c, i) => (c.embedding = vectors[i]));
  const store = getVectorStore();
  await store.upsert(cqlNamespace(), chunks);

  return {
    url,
    fetchedChars: combinedText.length,
    chunks: chunks.length,
    pagesFetched,
    pagesTotal: CQL_DOC_PAGES.length,
    pageUrls,
    usedMockStore: store.isMock,
    usedOpenAI,
    warnings,
  };
}

/** Very small HTML → text converter (no deps): drop script/style, unwrap tags, decode entities. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<\/(p|div|section|li|h[1-6]|tr|table|pre|br|td|th)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Chunk text into ~1200-char sections on blank lines or markdown headings. */
function splitSections(text: string): { heading: string; text: string }[] {
  const blocks = text.split(/\n(?=## )|\n---\n|\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const out: { heading: string; text: string }[] = [];
  let buf: string[] = [];
  let size = 0;
  const flush = () => {
    if (!buf.length) return;
    const joined = buf.join("\n\n");
    const headingLine = joined.match(/^## (.+)/m)?.[1] ?? buf[0].slice(0, 80);
    out.push({ heading: headingLine.slice(0, 120), text: joined });
    buf = [];
    size = 0;
  };
  for (const block of blocks) {
    if (size + block.length > 1200 && buf.length) flush();
    buf.push(block);
    size += block.length;
  }
  flush();
  return out;
}
