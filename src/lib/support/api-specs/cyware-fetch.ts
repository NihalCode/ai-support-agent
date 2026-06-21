import "server-only";

import { safeFetch } from "../../ssrf";
import { withRetry } from "../retry";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Browser-like headers Cyware/Theneo doc hosts expect (blocks bare server fetch UAs). */
export function cywareDocHeaders(referer: string): Record<string, string> {
  return {
    "User-Agent": BROWSER_UA,
    Accept: "text/plain,text/html,application/xhtml+xml,application/json,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: referer,
    "Cache-Control": "no-cache",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
  };
}

/** Fetch a Cyware public doc URL with browser headers + retries. Tries alternate URLs on 403. */
export async function fetchCywareDoc(
  urls: string[],
  referer: string
): Promise<{ text: string; url: string }> {
  const headers = cywareDocHeaders(referer);
  let lastStatus = 0;

  for (const url of urls) {
    try {
      const res = await withRetry(() => safeFetch(url, { headers }), { retries: 2, baseDelayMs: 500 });
      lastStatus = res.status;
      if (res.ok && res.text.trim().length > 0) {
        return { text: res.text, url };
      }
    } catch {
      /* try next URL */
    }
  }

  throw new Error(
    `Cyware doc fetch failed (${lastStatus || 403}) for: ${urls[0]}${urls.length > 1 ? ` (+${urls.length - 1} alternates)` : ""}`
  );
}
