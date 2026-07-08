/**
 * CLI to run the knowledge sync pipeline.
 * Usage: npm run knowledge:sync [-- --source=cyware-ctix --force]
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

import { runKnowledgeSync } from "../src/knowledge/ingestion/KnowledgeSyncService";

function parseArgs(argv: string[]) {
  const sourceIds: string[] = [];
  let force = false;
  for (const arg of argv) {
    if (arg === "--force") force = true;
    else if (arg.startsWith("--source=")) sourceIds.push(arg.slice("--source=".length));
  }
  return { sourceIds: sourceIds.length ? sourceIds : undefined, force };
}

async function main(): Promise<void> {
  const { sourceIds, force } = parseArgs(process.argv.slice(2));
  console.log("AI Support Studio — knowledge sync\n");

  const result = await runKnowledgeSync({
    triggeredBy: "manual",
    sourceIds,
    force,
  });

  console.log(`Status: ${result.run.status}`);
  console.log(`Sources: ${result.run.sourceIds.join(", ")}`);
  console.log(
    `Chunks: ${result.run.chunkCount}, skipped: ${result.run.skippedUnchangedCount}, failed: ${result.run.failedCount}`
  );

  for (const source of result.sources) {
    const line = [
      source.sourceId,
      source.ok ? (source.skipped ? "skipped" : "ok") : "failed",
      `${source.chunks} chunks`,
      source.error ?? "",
    ]
      .filter(Boolean)
      .join(" · ");
    console.log(`  ${line}`);
  }

  if (result.run.errorSummary) {
    console.log(`\nErrors: ${result.run.errorSummary}`);
  }

  process.exit(result.run.status === "failed" ? 1 : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
