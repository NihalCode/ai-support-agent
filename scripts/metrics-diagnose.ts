#!/usr/bin/env tsx
import "server-only";

import { runMetricsDiagnostics } from "../src/metrics/MetricsDiagnostics";

async function main() {
  const result = await runMetricsDiagnostics();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
