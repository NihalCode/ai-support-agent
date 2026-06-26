import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const src =
  process.env.DOCS_ENV_FILE?.trim() ||
  path.join(process.cwd(), "..", "intel-exchange-runnable-docs", ".env.local");
const dst = ".env.local";
const map = { PINECONE_INDEX: "PINECONE_INDEX_NAME" };
const want = new Set([
  "OPENAI_API_KEY",
  "PINECONE_API_KEY",
  "PINECONE_CLOUD",
  "PINECONE_REGION",
  "PINECONE_INDEX",
  "GITHUB_TOKEN",
]);

if (!existsSync(src)) {
  console.error("missing docs .env.local");
  process.exit(1);
}

const out = [];
for (const line of readFileSync(src, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  const [, k, raw] = m;
  if (!want.has(k)) continue;
  const key = map[k] ?? k;
  let val = raw.replace(/^["']|["']$/g, "");
  if (key === "PINECONE_INDEX_NAME" && k === "PINECONE_INDEX" && val === "intel-exchange-docs") {
    val = "support-agent-rag";
  }
  out.push(`${key}=${val}`);
}
if (!out.some((l) => l.startsWith("PINECONE_INDEX_NAME="))) {
  out.push("PINECONE_INDEX_NAME=support-agent-rag");
}
writeFileSync(dst, `${out.join("\n")}\n`);
console.log("wrote", dst, "keys:", out.map((l) => l.split("=")[0]).join(", "));
