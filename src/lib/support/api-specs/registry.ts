import "server-only";

import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { NormalizedApiSpec } from "../types";
import { embedBatch } from "../embed";
import { getVectorStore } from "../vector-store";
import { chunkApiSpec, apiSpecNamespace } from "./index";

/**
 * Registry of imported API specs. Persists to disk (or /tmp on serverless) so
 * imports survive warm instances. Falls back to in-memory only when the FS is
 * read-only.
 */

const g = globalThis as unknown as { __apiSpecs?: Map<string, NormalizedApiSpec>; __apiSpecsLoaded?: boolean };
const specs: Map<string, NormalizedApiSpec> = (g.__apiSpecs ??= new Map());

function dataDir(): string {
  if (process.env.API_SPECS_DATA_DIR) return process.env.API_SPECS_DATA_DIR;
  return path.join(/* turbopackIgnore: true */ process.cwd(), ".data", "api-specs");
}

function ensureLoaded(): void {
  if (g.__apiSpecsLoaded) return;
  g.__apiSpecsLoaded = true;
  try {
    const dir = dataDir();
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      const raw = readFileSync(path.join(dir, f), "utf8");
      const spec = JSON.parse(raw) as NormalizedApiSpec;
      if (spec?.id) specs.set(spec.id, spec);
    }
  } catch {
    // FS unavailable — in-memory only
  }
}

function persistSpec(spec: NormalizedApiSpec): void {
  try {
    const dir = dataDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${spec.id}.json`), JSON.stringify(spec));
  } catch {
    // read-only FS (e.g. some serverless cold starts)
  }
}

export function registerSpec(spec: NormalizedApiSpec): void {
  ensureLoaded();
  specs.set(spec.id, spec);
  persistSpec(spec);
}

export function getSpec(id: string): NormalizedApiSpec | null {
  ensureLoaded();
  return specs.get(id) ?? null;
}

export function listSpecs(): NormalizedApiSpec[] {
  ensureLoaded();
  return [...specs.values()];
}

export function removeSpec(id: string): boolean {
  ensureLoaded();
  const ok = specs.delete(id);
  if (ok) {
    try {
      const file = path.join(dataDir(), `${id}.json`);
      if (existsSync(file)) unlinkSync(file);
    } catch {
      /* ignore */
    }
  }
  return ok;
}

/** Embed + upsert a spec's endpoint chunks into its namespace. */
export async function indexSpec(
  spec: NormalizedApiSpec
): Promise<{ namespace: string; chunks: number; usedMockStore: boolean; usedOpenAI: boolean }> {
  registerSpec(spec);
  const chunks = chunkApiSpec(spec);
  const namespace = apiSpecNamespace(spec.id);
  if (chunks.length === 0) {
    const store = getVectorStore();
    return { namespace, chunks: 0, usedMockStore: store.isMock, usedOpenAI: false };
  }
  const { vectors, usedOpenAI } = await embedBatch(chunks.map((c) => c.text));
  chunks.forEach((c, i) => (c.embedding = vectors[i]));
  const store = getVectorStore();
  await store.upsert(namespace, chunks);
  return { namespace, chunks: chunks.length, usedMockStore: store.isMock, usedOpenAI };
}
