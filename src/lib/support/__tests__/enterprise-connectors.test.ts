import { describe, expect, it } from "vitest";

import { MockConfluenceConnector } from "../connectors/confluence";
import { MockZendeskTicketConnector } from "../connectors/zendesk";
import { chunkKnowledgeDocument } from "../chunk";

describe("enterprise connectors", () => {
  it("searches mock Zendesk tickets and returns normalized refs", async () => {
    const connector = new MockZendeskTicketConnector();
    const results = await connector.searchIssues("indicator sync", 5);
    expect(results[0]?.source).toBe("zendesk");
    expect(results[0]?.id).toMatch(/^ZD-/);
  });

  it("searches mock Confluence docs", async () => {
    const connector = new MockConfluenceConnector();
    const results = await connector.searchDocuments("CQL tag filtering", 5);
    expect(results[0]?.source).toBe("confluence");
    expect(results[0]?.title).toMatch(/CQL|Runbook/i);
  });

  it("chunks Confluence documents with enterprise metadata", () => {
    const chunks = chunkKnowledgeDocument({
      id: "page-1",
      source: "confluence",
      title: "Runbook",
      body: "Step one\n\nStep two",
      url: "https://example.test/wiki/page-1",
      spaceKey: "SUP",
    });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.metadata.sourceType).toBe("confluence");
    expect(chunks[0]?.metadata.source_name).toBe("Confluence");
  });
});
