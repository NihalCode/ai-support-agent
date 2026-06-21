import "server-only";

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { CywareProductId } from "../cyware-products";
import type { NormalizedApiSpec } from "../types";

/**
 * Bundled Cyware API specs vendored under data/cyware-specs/. Used when live
 * Theneo fetches return 403 from datacenter IPs (e.g. Vercel). Refresh with
 * npm run vendor:cyware-specs from a network that can reach cyware.com docs.
 */

export function bundledSpecPath(productId: CywareProductId): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "data", "cyware-specs", `${productId}.json`);
}

export function loadBundledCywareSpec(productId: CywareProductId): NormalizedApiSpec | null {
  const file = bundledSpecPath(productId);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as NormalizedApiSpec;
  } catch {
    return null;
  }
}

export function hasBundledCywareSpec(productId: CywareProductId): boolean {
  return existsSync(bundledSpecPath(productId));
}
