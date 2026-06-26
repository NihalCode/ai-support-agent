import type { NormalizedApiSpec } from "@/lib/support/types";
import { ingestTheneoDocs, looksLikeTheneoUrl } from "@/lib/support/api-specs/theneo";
import { safeFetch } from "@/lib/ssrf";
import { normalizeApiSource } from "@/lib/support/api-specs";
import { detectSource } from "./sourceDetector";

export interface DocsCrawlResult {
  spec?: NormalizedApiSpec;
  warnings: string[];
  sourceKind: string;
}

/** Crawl or fetch API documentation from a public URL. */
export async function crawlDocsUrl(url: string, opts: { name?: string; maxPages?: number } = {}): Promise<DocsCrawlResult> {
  const detected = detectSource({ url });
  const warnings: string[] = [];

  if (detected.kind === "theneo" || looksLikeTheneoUrl(url)) {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const project = parts[0] ?? "api-reference";
    const result = await ingestTheneoDocs({
      origin: u.origin,
      project,
      name: opts.name ?? project,
      maxPages: opts.maxPages ?? 200,
    });
    return { spec: result.spec, warnings: result.warnings, sourceKind: "theneo" };
  }

  const res = await safeFetch(url, { headers: { Accept: "application/json, text/yaml, text/plain, */*" } });
  if (!res.ok) throw new Error(`Failed to fetch docs (${res.status})`);
  const content = res.text;
  const spec = normalizeApiSource(content, { name: opts.name, sourceUrl: url });
  return { spec, warnings, sourceKind: spec.sourceKind };
}
