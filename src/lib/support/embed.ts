import "server-only";

import { getConfig, hasOpenAI } from "./config";
import { embedTexts, EMBEDDING_DIMENSION } from "./openai";

/**
 * Embedding service. Uses OpenAI text-embedding-3-small when a key is present;
 * otherwise a deterministic local "hashing embedding" so retrieval still works
 * offline (bag-of-token-hashes projected to the same dimension). The local
 * embedding approximates lexical similarity — good enough for demo + tests.
 */

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function hash(token: string): number {
  let h = 2166136261;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function hashingEmbedding(text: string, dim = EMBEDDING_DIMENSION): number[] {
  const vec = new Array(dim).fill(0);
  const tokens = tokenize(text);
  for (const tok of tokens) {
    const idx = hash(tok) % dim;
    const sign = (hash(tok + "#") & 1) === 0 ? 1 : -1;
    vec[idx] += sign;
    // Bigram for a little context sensitivity.
  }
  // L2 normalize.
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => v / norm);
}

export interface EmbedOutcome {
  vectors: number[][];
  usedOpenAI: boolean;
}

export async function embedBatch(texts: string[]): Promise<EmbedOutcome> {
  const cfg = getConfig();
  if (hasOpenAI(cfg) && cfg.openaiApiKey) {
    try {
      const vectors: number[][] = [];
      for (let i = 0; i < texts.length; i += 64) {
        const batch = texts.slice(i, i + 64);
        vectors.push(...(await embedTexts(batch, cfg.openaiApiKey)));
      }
      return { vectors, usedOpenAI: true };
    } catch {
      // fall through to local
    }
  }
  return { vectors: texts.map((t) => hashingEmbedding(t)), usedOpenAI: false };
}

export async function embedQueryText(text: string): Promise<{ vector: number[]; usedOpenAI: boolean }> {
  const { vectors, usedOpenAI } = await embedBatch([text]);
  return { vector: vectors[0] ?? hashingEmbedding(text), usedOpenAI };
}
