import { describe, expect, it, vi } from "vitest";

describe("enterprise workspace search", () => {
  it("includes Zendesk and Confluence in test-mode semantic results", async () => {
    vi.stubEnv("TEST_MODE", "true");
    const { workspaceSearch } = await import("../search/workspace-search");
    const result = await workspaceSearch({ query: "indicator sync cql", mode: "semantic" });
    expect(result.results.some((r) => r.sourceType === "zendesk")).toBe(true);
    expect(result.results.some((r) => r.sourceType === "confluence")).toBe(true);
    vi.unstubAllEnvs();
  });
});
