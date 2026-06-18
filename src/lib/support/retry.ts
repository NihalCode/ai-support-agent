import "server-only";

/**
 * Small retry helper with exponential backoff + jitter. Retries transient
 * failures (network errors, 429, 5xx) but never retries 4xx client errors
 * other than 429. Used by connectors, OpenAI, and Pinecone clients.
 */

export interface RetryOpts {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Decide if a resolved value is retryable (e.g. a 429/5xx response). */
  retryOn?: (value: unknown) => boolean;
}

function defaultRetryOn(value: unknown): boolean {
  const status = (value as { status?: number } | null)?.status;
  if (typeof status !== "number") return false;
  return status === 429 || status === 408 || (status >= 500 && status < 600);
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const { retries = 3, baseDelayMs = 400, maxDelayMs = 4000, retryOn = defaultRetryOn } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await fn();
      if (attempt < retries && retryOn(result)) {
        await sleep(backoff(attempt, baseDelayMs, maxDelayMs));
        continue;
      }
      return result;
    } catch (err) {
      lastErr = err;
      if (attempt >= retries) break;
      await sleep(backoff(attempt, baseDelayMs, maxDelayMs));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Retry attempts exhausted");
}

function backoff(attempt: number, base: number, max: number): number {
  const exp = Math.min(max, base * 2 ** attempt);
  return Math.floor(exp / 2 + Math.random() * (exp / 2));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
