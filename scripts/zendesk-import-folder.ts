/**
 * CLI to import Zendesk tickets from a local export folder.
 * Usage: npm run zendesk:import [-- --dry-run --force --dir=.data/imports/zendesk --limit=100]
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

loadEnvLocal();

import { ingestZendeskTicketsFromFolder } from "../src/lib/support/enterprise/zendesk-folder-ingest";

function parseArgs(argv: string[]) {
  let dryRun = false;
  let force = false;
  let dir: string | undefined;
  let limit: number | undefined;

  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--force") force = true;
    else if (arg.startsWith("--dir=")) dir = arg.slice("--dir=".length);
    else if (arg.startsWith("--limit=")) {
      const n = Number.parseInt(arg.slice("--limit=".length), 10);
      if (Number.isFinite(n) && n > 0) limit = n;
    }
  }

  return { dryRun, force, dir, limit };
}

async function main(): Promise<void> {
  const { dryRun, force, dir, limit } = parseArgs(process.argv.slice(2));
  console.log("AI Support Studio — Zendesk folder import\n");

  const result = await ingestZendeskTicketsFromFolder({ dir, force, dryRun, limit });

  console.log(`Mode: ${result.dryRun ? "dry-run (parse only)" : "import"}`);
  console.log(`Export root: ${result.exportRoot}`);
  console.log(`Namespace: ${result.namespace}`);
  console.log(
    `Tickets: ${result.ticketsParsed} parsed, ${result.ticketsStored} stored, ${result.chunks} chunks, ${result.upserted} upserted`
  );
  console.log(
    `Stats: ${result.stats.ticketFilesFound} files, ${result.stats.commentsLoaded} with comments, ${result.stats.skipped} skipped`
  );
  console.log(`Checksum: ${result.checksum}`);

  if (result.sampleTitles.length > 0) {
    console.log("\nSample titles:");
    for (const title of result.sampleTitles) {
      console.log(`  - ${title}`);
    }
  }

  if (result.errors.length > 0) {
    console.log(`\nErrors (${result.errors.length}):`);
    for (const err of result.errors.slice(0, 20)) {
      console.log(`  - ${err}`);
    }
    if (result.errors.length > 20) {
      console.log(`  ... and ${result.errors.length - 20} more`);
    }
  }

  if (!result.dryRun) {
    console.log(
      `\nVector store: ${result.usedMockStore ? "in-memory mock" : "Pinecone"}, OpenAI embeddings: ${result.usedOpenAI ? "yes" : "no (hashing fallback)"}`
    );
  }

  process.exit(result.errors.length > 0 && result.ticketsParsed === 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
