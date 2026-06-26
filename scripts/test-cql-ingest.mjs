/**
 * Quick smoke test: fetch all CQL doc pages and report char counts (no Pinecone).
 */

const BASE = "https://techdocs.cyware.com/ctix/en/";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/plain,text/html,application/xhtml+xml,application/json,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: BASE,
  "Cache-Control": "no-cache",
};
const CQL_DOC_PAGES = [
  "cyware-query-language--cql-.html",
  "get-started-with-cql.html",
  "understand-cql-grammar.html",
  "apply-conditions-based-on-operators.html",
  "start-using-cql.html",
  "save-cql-queries.html",
  "cql-query-usecase.html",
];

function htmlToText(html) {
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

async function fetchPage(path) {
  const url = `${BASE}${path}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
      return res.text();
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
}

let total = 0;
for (const p of CQL_DOC_PAGES) {
  const html = await fetchPage(p);
  const text = htmlToText(html);
  console.log(`${p}: ${html.length} raw → ${text.length} text`);
  total += text.length;
  await new Promise((r) => setTimeout(r, 400));
}
console.log("\nPages:", CQL_DOC_PAGES.length);
console.log("Total text chars:", total);
console.log("Expected chunks (~1200 each):", Math.ceil(total / 1200));
