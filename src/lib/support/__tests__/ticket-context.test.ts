import { describe, expect, it } from "vitest";

import {
  AUTO_LINK_MIN_SCORE,
  contextSearchQuery,
  formatAutoLinkedTicketsNote,
  parseExplicitTicketRefs,
  scoreTicketAgainstQuery,
} from "../investigation/ticket-context";
import type { SupportQuery } from "../investigation/types";

describe("parseExplicitTicketRefs", () => {
  it("splits Jira and Zendesk keys", () => {
    expect(
      parseExplicitTicketRefs("Zendesk ZD-1 and Jira AISUP5-1")
    ).toEqual({ jira: "AISUP5-1", zendesk: "ZD-1" });
  });

  it("ignores ZD as Jira key", () => {
    expect(parseExplicitTicketRefs("see ZD-42")).toEqual({ zendesk: "ZD-42" });
  });
});

describe("contextSearchQuery", () => {
  it("builds keywords from symptoms without ticket ids", () => {
    const q: SupportQuery = {
      text: "We're seeing 401 on the CTIX Open API since this morning",
      statusCode: 401,
    };
    const terms = contextSearchQuery(q);
    expect(terms).toMatch(/401/);
    expect(terms).toMatch(/CTIX/);
    expect(terms).not.toMatch(/AISUP/);
  });
});

describe("scoreTicketAgainstQuery", () => {
  it("ranks matching CTIX 401 ticket higher", () => {
    const q: SupportQuery = {
      text: "401 on CTIX Open API since this morning",
      statusCode: 401,
    };
    const good = scoreTicketAgainstQuery(
      {
        id: "1",
        key: "ZD-1",
        source: "zendesk",
        title: "CTIX Open API returns 401 Unauthorized",
        body: "Customer reports CTIX authentication failure since this morning",
        state: "open",
        labels: [],
        comments: [],
        url: "https://example.zendesk.com/tickets/1",
      },
      q
    );
    const weak = scoreTicketAgainstQuery(
      {
        id: "2",
        key: "ZD-2",
        source: "zendesk",
        title: "Password reset help",
        body: "User forgot password",
        state: "open",
        labels: [],
        comments: [],
        url: "https://example.zendesk.com/tickets/2",
      },
      q
    );
    expect(good).toBeGreaterThan(weak);
    expect(good).toBeGreaterThanOrEqual(AUTO_LINK_MIN_SCORE);
  });
});

describe("formatAutoLinkedTicketsNote", () => {
  it("formats auto-linked note", () => {
    const note = formatAutoLinkedTicketsNote({
      jiraIssueKey: "AISUP5-1",
      zendeskTicketId: "ZD-1",
      autoLinkedJira: true,
      autoLinkedZendesk: true,
    });
    expect(note).toContain("AISUP5-1");
    expect(note).toContain("ZD-1");
    expect(note).toContain("matched from context");
  });
});
