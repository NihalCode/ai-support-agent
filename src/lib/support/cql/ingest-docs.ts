import "server-only";

import type { SupportChunk } from "../types";
import { getConfig } from "../config";
import { embedBatch } from "../embed";
import { getVectorStore } from "../vector-store";
import { safeFetch } from "../../ssrf";

/**
 * Ingest the Cyware Query Language (CQL) documentation into the vector store so
 * NL→CQL generation is grounded in real syntax (never hallucinated). Fetches
 * the live techdocs URL (decision: fetch_live), strips HTML to text, chunks by
 * heading, embeds, and upserts into the CQL namespace.
 */

export const DEFAULT_CQL_DOC_URL =
  "https://techdocs.cyware.com/ctix/en/cyware-query-language--cql-.html";

export function cqlNamespace(): string {
  const base = getConfig().pinecone.namespace;
  return (base ? `${base}__` : "") + "cql-docs";
}

export interface CqlIngestResult {
  url: string;
  fetchedChars: number;
  chunks: number;
  usedMockStore: boolean;
  usedOpenAI: boolean;
  warnings: string[];
}

export async function ingestCqlDocs(
  url = DEFAULT_CQL_DOC_URL,
  directContent?: string
): Promise<CqlIngestResult> {
  const warnings: string[] = [];
  let text: string;

  if (directContent?.trim()) {
    text = directContent.trim();
  } else {
    const res = await safeFetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain,*/*",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });
    if (!res.ok) throw new Error(`Failed to fetch CQL docs (${res.status})`);
    text = htmlToText(res.text);
  }

  if (text.length < 400) {
    warnings.push(
      "Fetched CQL page is very short — it may be a JavaScript-rendered SPA. " +
        "Consider providing the docs text directly. Generation will report missing syntax if the indexed content is insufficient."
    );
  }

  const sections = splitSections(text);
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
      url,
      source_name: "Cyware Query Language (CQL)",
      source_url: url,
      cyware_doc_section: s.heading,
      created_at: now,
      updated_at: now,
    },
  }));

  if (chunks.length === 0) {
    const store = getVectorStore();
    return { url, fetchedChars: text.length, chunks: 0, usedMockStore: store.isMock, usedOpenAI: false, warnings };
  }

  const { vectors, usedOpenAI } = await embedBatch(chunks.map((c) => c.text));
  chunks.forEach((c, i) => (c.embedding = vectors[i]));
  const store = getVectorStore();
  await store.upsert(cqlNamespace(), chunks);

  return { url, fetchedChars: text.length, chunks: chunks.length, usedMockStore: store.isMock, usedOpenAI, warnings };
}

/** Very small HTML → text converter (no deps): drop script/style, unwrap tags, decode common entities. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|section|li|h[1-6]|tr|table|pre|br)>/gi, "\n")
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

/** Chunk plain text into ~1500-char sections, preferring blank-line boundaries. */
function splitSections(text: string): { heading: string; text: string }[] {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const out: { heading: string; text: string }[] = [];
  let buf: string[] = [];
  let size = 0;
  const flush = () => {
    if (!buf.length) return;
    const joined = buf.join("\n\n");
    out.push({ heading: buf[0].slice(0, 80), text: joined });
    buf = [];
    size = 0;
  };
  for (const p of paras) {
    if (size + p.length > 1500 && buf.length) flush();
    buf.push(p);
    size += p.length;
  }
  flush();
  return out;
}
