#!/usr/bin/env tsx
import "server-only";

import { recomputeRollups } from "../src/metrics/MetricsAggregator";

async function main() {
  const result = await recomputeRollups();
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
