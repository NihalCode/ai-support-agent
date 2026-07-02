import { describe, it, expect, beforeEach } from "vitest";
import {
  isConfluenceSyncInProgress,
  tryAcquireConfluenceSyncLock,
  releaseConfluenceSyncLock,
} from "@/integrations/confluence/sync-lock";

describe("Confluence sync lock", () => {
  beforeEach(() => {
    releaseConfluenceSyncLock();
  });

  it("allows only one active sync lock", () => {
    expect(tryAcquireConfluenceSyncLock()).toBe(true);
    expect(isConfluenceSyncInProgress()).toBe(true);
    expect(tryAcquireConfluenceSyncLock()).toBe(false);
    releaseConfluenceSyncLock();
    expect(isConfluenceSyncInProgress()).toBe(false);
    expect(tryAcquireConfluenceSyncLock()).toBe(true);
    releaseConfluenceSyncLock();
  });
});
