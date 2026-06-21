import "server-only";

import { safeFetch } from "../../ssrf";
import { parsePostman } from "./postman";
import type { NormalizedApiSpec } from "../types";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Detect Postman Documenter sites (e.g. cftrapi.cyware.com). */
export function looksLikePostmanDocumenterUrl(url: string): boolean {
  return /cftrapi\.cyware\.com/i.test(url) || /documenter\.getpostman\.com/i.test(url);
}

/** Extract Postman collection JSON URL from a Postman Documenter HTML page. */
export function collectionUrlFromDocumenterHtml(html: string, pageUrl: string): string | null {
  const direct = html.match(/href="(https:\/\/[^"]+\/api\/collections\/[^"]+)"/i)?.[1];
  if (direct) return direct.replace(/&amp;/g, "&");

  const owner = html.match(/name="ownerId"\s+content="(\d+)"/i)?.[1];
  const published = html.match(/name="publishedId"\s+content="([^"]+)"/i)?.[1];
  if (owner && published) {
    const origin = new URL(pageUrl).origin;
    return `${origin}/api/collections/${owner}/${published}?segregateAuth=true&versionTag=latest`;
  }
  return null;
}

/** Fetch a Postman Documenter collection and normalize it. */
export async function ingestPostmanDocumenter(
  pageOrCollectionUrl: string,
  name?: string
): Promise<{ spec: NormalizedApiSpec; collectionUrl: string }> {
  let collectionUrl = pageOrCollectionUrl;
  if (!pageOrCollectionUrl.includes("/api/collections/")) {
    const res = await safeFetch(pageOrCollectionUrl, {
      headers: { Accept: "text/html,*/*", "User-Agent": BROWSER_UA },
    });
    if (!res.ok) throw new Error(`Postman Documenter page fetch failed (${res.status})`);
    const extracted = collectionUrlFromDocumenterHtml(res.text, pageOrCollectionUrl);
    if (!extracted) throw new Error("Could not find Postman collection URL in page HTML.");
    collectionUrl = extracted;
  }

  const colRes = await safeFetch(collectionUrl, {
    headers: { Accept: "application/json", "User-Agent": BROWSER_UA },
  });
  if (!colRes.ok) throw new Error(`Postman collection fetch failed (${colRes.status})`);

  const spec = parsePostman(colRes.text, name);
  spec.sourceUrl = collectionUrl;
  return { spec, collectionUrl };
}
