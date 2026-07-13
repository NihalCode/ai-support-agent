import { describe, expect, it } from "vitest";

import {
  formatZendeskResearchResponse,
  type ZendeskTicketResearchResult,
} from "../enterprise/zendesk-ticket-research";
import type { ZendeskConnectorStatus } from "../enterprise/zendesk-readiness";
import { zendeskTicketNamespace } from "../enterprise/zendesk-ticket-ingest";

function status(
  overrides: Partial<ZendeskConnectorStatus> = {}
): ZendeskConnectorStatus {
  return {
    connected: true,
    authorized: true,
    enabled: true,
    tenantId: "default",
    organizationId: "default",
    integrationId: "zendesk:default",
    syncState: "ready",
    ticketsDiscovered: 1,
    ticketsStored: 1,
    ticketsIndexed: 1,
    commentsIndexed: 1,
    ...overrides,
  };
}

function result(
  overrides: Partial<ZendeskTicketResearchResult> = {}
): ZendeskTicketResearchResult {
  return {
    status: status(),
    queryTerms: ["ctix", "package", "indicator", "count"],
    durationMs: 12,
    traceId: "trace-safe",
    matches: [],
    ...overrides,
  };
}

describe("Zendesk ticket research response", () => {
  it("isolates non-default organizations in separate vector namespaces", () => {
    expect(zendeskTicketNamespace("org-a")).not.toBe(zendeskTicketNamespace("org-b"));
  });

  it("grounds the answer in retrieved ticket fields and citations", () => {
    const response = formatZendeskResearchResponse(
      result({
        matches: [
          {
            score: 50,
            whyRelevant: "Matches CTIX package and indicator count.",
            documentedOutcome: "Corrected in the current production version.",
            ticket: {
              id: "ZD-286",
              key: "ZD-286",
              source: "zendesk",
              title: "CTIX Package List No Indicator Count",
              body: "Indicator count is missing from package export.",
              state: "closed",
              priority: "normal",
              labels: ["ctix"],
              comments: [
                {
                  author: "agent",
                  body: "Corrected in the current production version.",
                },
              ],
              url: "",
              createdAt: "2021-05-17T00:00:00.000Z",
              updatedAt: "2026-02-13T00:00:00.000Z",
            },
          },
        ],
      })
    );

    expect(response).toContain("ZD-286");
    expect(response).toContain("CTIX Package List No Indicator Count");
    expect(response).toContain("Corrected in the current production version.");
    expect(response).toContain("Zendesk ZD-286");
    expect(response).not.toContain("Understood as: unknown");
  });

  it("distinguishes not connected from stored but unindexed", () => {
    const disconnected = formatZendeskResearchResponse(
      result({
        status: status({
          connected: false,
          authorized: false,
          syncState: "never_synced",
          ticketsDiscovered: 0,
          ticketsStored: 0,
          ticketsIndexed: 0,
          commentsIndexed: 0,
        }),
      })
    );
    expect(disconnected).toContain("not connected");

    const unindexed = formatZendeskResearchResponse(
      result({
        status: status({
          syncState: "partial",
          ticketsStored: 10,
          ticketsIndexed: 0,
        }),
      })
    );
    expect(unindexed).toContain("indexing has not completed");
  });

  it("returns a sanitized trace ID on retrieval failure", () => {
    const response = formatZendeskResearchResponse(
      result({
        status: status({
          syncState: "failed",
          lastErrorCode: "INDEX_UNAVAILABLE",
          sanitizedLastError: "Zendesk search index is unavailable.",
        }),
      })
    );
    expect(response).toContain("Request ID: trace-safe");
    expect(response).not.toContain("INDEX_UNAVAILABLE");
  });
});
