import { beforeEach } from "vitest";
import { releaseConfluenceSyncLock } from "@/integrations/confluence/sync-lock";

/** Unit tests use file/in-memory stores unless VITEST_USE_POSTGRES=1. */
if (!process.env.VITEST_USE_POSTGRES) {
  delete process.env.DATABASE_URL;
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
