/**
 * CLI knowledge pipeline diagnostics (no secrets printed).
 * Usage: npm run knowledge:diagnose
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

import { getKnowledgeDiagnostics } from "../src/knowledge/diagnostics/KnowledgeDiagnosticsService";
import { listKnowledgeSources } from "../src/knowledge/sources/SourceRegistry";

async function main(): Promise<void> {
  console.log("AI Support Studio — knowledge diagnostics\n");

  const diagnostics = await getKnowledgeDiagnostics();
  const sources = listKnowledgeSources();

  console.log("Configuration:");
  console.log(`  vectorDbConfigured: ${diagnostics.vectorDbConfigured}`);
  console.log(`  embeddingConfigured: ${diagnostics.embeddingConfigured}`);
  console.log(`  sources: ${diagnostics.enabledSourceCount}/${diagnostics.sourceCount} enabled`);

  console.log("\nIndex state:");
  console.log(`  indexed documents: ${diagnostics.indexedDocumentCount}`);
  console.log(`  indexed chunks: ${diagnostics.indexedChunkCount}`);
  console.log(`  stale documents: ${diagnostics.staleDocumentCount}`);
  console.log(`  failed sources: ${diagnostics.failedSourceCount}`);

  if (diagnostics.lastSyncAt) {
    console.log(
      `\nLast sync: ${diagnostics.lastSyncAt} (${diagnostics.lastSyncStatus ?? "unknown"})`
    );
  } else {
    console.log("\nLast sync: none");
  }

  console.log("\nRegistered sources:");
  for (const source of sources) {
    console.log(
      `  ${source.id}: ${source.name} [${source.enabled ? "enabled" : "disabled"}] (${source.product})`
    );
  }

  const ok =
    diagnostics.embeddingConfigured &&
    diagnostics.sourceCount > 0 &&
    diagnostics.enabledSourceCount > 0;

  console.log(`\nOverall: ${ok ? "OK" : "NEEDS ATTENTION"}`);
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
