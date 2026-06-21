/**
 * Vendor bundled Cyware API specs for offline/Vercel fallback when live
 * Theneo fetches return 403 from datacenter IPs.
 *
 *   npm run vendor:cyware-specs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { CywareProductId } from "../src/lib/support/cyware-products";
import { importCywareProduct } from "../src/lib/support/api-specs/cyware-import";

const products: CywareProductId[] = ["ctix", "csap", "cftr", "orchestrate"];
const outDir = path.join(process.cwd(), "data", "cyware-specs");

async function main() {
  mkdirSync(outDir, { recursive: true });
  for (const productId of products) {
    process.stdout.write(`Fetching ${productId}… `);
    try {
      const result = await importCywareProduct(productId, { index: false, forceLive: true });
      const file = path.join(outDir, `${productId}.json`);
      writeFileSync(file, JSON.stringify(result.spec));
      console.log(`${result.spec.endpoints.length} endpoints (${result.source}) → ${file}`);
    } catch (err) {
      console.log(`FAILED: ${err instanceof Error ? err.message : err}`);
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
