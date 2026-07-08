import { describe, it, expect, beforeEach } from "vitest";

import {
  checksumForContent,
  getKnowledgeDocumentState,
  upsertKnowledgeDocumentState,
} from "../stores/knowledge-sync-store";

describe("checksum skip logic", () => {
  const sourceId = "test-checksum-source";

  beforeEach(async () => {
    await upsertKnowledgeDocumentState({
      sourceId,
      url: "https://example.test/docs",
      checksum: checksumForContent("v1"),
      vectorIds: ["vec-1"],
      namespace: "test-ns",
      lastIndexedAt: new Date().toISOString(),
      status: "active",
      chunkCount: 12,
    });
  });

  it("skips re-index when checksum is unchanged and force is false", async () => {
    const prev = await getKnowledgeDocumentState(sourceId);
    const nextChecksum = checksumForContent("v1");
    const force = false;

    const shouldSkip = !force && prev?.checksum === nextChecksum;
    expect(shouldSkip).toBe(true);
    expect(prev?.chunkCount).toBe(12);
  });

  it("re-indexes when checksum changes", async () => {
    const prev = await getKnowledgeDocumentState(sourceId);
    const nextChecksum = checksumForContent("v2");
    const force = false;

    const shouldSkip = !force && prev?.checksum === nextChecksum;
    expect(shouldSkip).toBe(false);
  });

  it("re-indexes when force is true even if checksum matches", async () => {
    const prev = await getKnowledgeDocumentState(sourceId);
    const nextChecksum = checksumForContent("v1");
    const force = true;

    const shouldSkip = !force && prev?.checksum === nextChecksum;
    expect(shouldSkip).toBe(false);
  });
});
