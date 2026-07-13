import { describe, expect, it } from "vitest";

import {
  searchStoredZendeskTickets,
  storedTicketToNormalized,
  upsertZendeskTickets,
} from "../enterprise/stores/zendesk-ticket-store";

describe("zendesk ticket store", () => {
  it("stores and searches tickets locally", async () => {
    await upsertZendeskTickets([
      {
        id: "1001",
        key: "ZD-1001",
        source: "zendesk",
        title: "CTIX Open API returns 401 Unauthorized",
        body: "Customer reports CTIX authentication failure since this morning",
        state: "open",
        labels: ["ctix", "api"],
        comments: [],
        url: "https://example.zendesk.com/tickets/1001",
      },
      {
        id: "1002",
        key: "ZD-1002",
        source: "zendesk",
        title: "Password reset help",
        body: "User forgot password",
        state: "open",
        labels: [],
        comments: [],
        url: "https://example.zendesk.com/tickets/1002",
      },
    ]);

    const hits = await searchStoredZendeskTickets("CTIX 401", 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.key).toBe("ZD-1001");
    expect(storedTicketToNormalized({
      ticketId: "1001",
      subject: "CTIX Open API returns 401 Unauthorized",
      description: "Customer reports CTIX authentication failure since this morning",
      status: "open",
      tags: ["ctix"],
      comments: [],
      syncedAt: new Date().toISOString(),
    }).key).toBe("ZD-1001");
  });
});
