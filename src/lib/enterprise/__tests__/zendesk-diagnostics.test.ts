import { beforeEach, describe, expect, it, vi } from "vitest";

const { getStatus, search } = vi.hoisted(() => ({
  getStatus: vi.fn(),
  search: vi.fn(),
}));

vi.mock("@/lib/db/postgres", () => ({ isPostgresConfigured: () => true }));
vi.mock("@/lib/support/enterprise/file-store", () => ({
  defaultOrgId: () => "default",
}));
vi.mock("@/lib/support/enterprise/zendesk-readiness", () => ({
  getZendeskConnectorStatus: getStatus,
}));
vi.mock("@/lib/support/enterprise/zendesk-search", () => ({
  searchZendeskForAgent: search,
}));

import {
  buildZendeskDiagnostics,
  runSanitizedZendeskTestSearch,
} from "../zendesk-diagnostics";

describe("Zendesk admin diagnostics", () => {
  beforeEach(() => {
    getStatus.mockReset();
    search.mockReset();
    getStatus.mockResolvedValue({
      connected: true,
      authorized: true,
      enabled: true,
      tenantId: "org-a",
      organizationId: "org-a",
      integrationId: "zendesk:org-a",
      accountSubdomain: "private-account",
      syncState: "ready",
      lastSuccessfulSyncAt: "2026-07-13T12:00:00.000Z",
      lastIndexedAt: "2026-07-13T12:00:00.000Z",
      ticketsDiscovered: 3,
      ticketsStored: 3,
      ticketsIndexed: 3,
      commentsIndexed: 8,
      newestSourceRecordAt: "2026-07-13T11:59:00.000Z",
      newestIndexedRecordAt: "2026-07-13T11:59:00.000Z",
      lastErrorCode: undefined,
      sanitizedLastError: undefined,
    });
  });

  it("removes sensitive connector metadata for developers", async () => {
    const diagnostics = await buildZendeskDiagnostics("org-a", false);
    expect(diagnostics.status).not.toHaveProperty("accountSubdomain");
    expect(diagnostics.status).not.toHaveProperty("apiToken");
    expect(diagnostics.status).not.toHaveProperty("email");
    expect(diagnostics.status.syncState).toBe("ready");
  });

  it("returns only sanitized counts and tracing data from test search", async () => {
    search.mockResolvedValue({
      tickets: [
        {
          id: "ZD-123",
          title: "Confidential customer title",
          body: "private ticket content",
        },
      ],
      fromIndex: true,
      fromLive: false,
    });

    const result = await runSanitizedZendeskTestSearch(
      "org-a",
      "private search query",
      "trace-123"
    );
    const serialized = JSON.stringify(result);
    expect(result).toMatchObject({
      resultCount: 1,
      indexedResultCount: 1,
      usedLiveSearch: false,
      traceId: "trace-123",
    });
    expect(serialized).not.toContain("Confidential");
    expect(serialized).not.toContain("private ticket");
    expect(serialized).not.toContain("search query");
  });
});
