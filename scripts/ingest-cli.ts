/**
 * CLI to ingest a repository into the vector store without the UI.
 *
 *   npm run ingest -- <owner/name | github-url>
 *
 * Reads credentials from the environment (.env.local). With no keys it runs on
 * the mock repo + in-memory store, which is only useful within a long-lived
 * process — so the CLI is mainly for Pinecone-backed ingestion.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (!process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

loadEnvLocal();

import { ingestRepo } from "../src/lib/support/ingest";

async function main() {
  const repoUrl = process.argv[2];
  console.log(`Ingesting ${repoUrl ?? "(default/mock repo)"}…`);
  const result = await ingestRepo({ repoUrl, includeIssues: true, includePRs: true });
  console.log(JSON.stringify(result, null, 2));
  if (result.usedMock.vectorStore) {
    console.warn(
      "\n[warn] Used the in-memory vector store. Set PINECONE_API_KEY for durable, cross-process retrieval."
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
