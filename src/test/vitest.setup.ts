import { beforeEach } from "vitest";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { releaseConfluenceSyncLock } from "@/integrations/confluence/sync-lock";

/** Unit tests use file/in-memory stores unless VITEST_USE_POSTGRES=1. */
if (!process.env.VITEST_USE_POSTGRES) {
  delete process.env.DATABASE_URL;
}

/** Isolate on-disk enterprise/approval stores per Vitest worker to avoid parallel test races. */
if (!process.env.SUPPORT_DATA_DIR) {
  const worker = process.env.VITEST_WORKER_ID ?? "0";
  const root = path.join(tmpdir(), `ai-support-agent-test-w${worker}`);
  mkdirSync(root, { recursive: true });
  process.env.SUPPORT_DATA_DIR = root;
}

/** Reset in-memory dedupe / approval caches between tests to avoid cross-test pollution. */
beforeEach(() => {
  const g = globalThis as unknown as {
    __approvalMem?: Map<string, unknown>;
    __slackDedup?: Map<string, number>;
  };
  g.__approvalMem = new Map();
  g.__slackDedup = new Map();
  releaseConfluenceSyncLock();
});
