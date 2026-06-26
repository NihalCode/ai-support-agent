import { describe, expect, it } from "vitest";
import {
  JIRA_ISSUE_KEY,
  parseApiImportListResponse,
  parseInvestigationsListResponse,
  parseMcpDiscoveryResponse,
  parseTicketRefResponse,
  parseTicketsSearchResponse,
  parseWorkspaceSearchResponse,
} from "../ide-api";

describe("ide-api contract parsers", () => {
  it("recognizes Jira issue keys", () => {
    expect(JIRA_ISSUE_KEY.test("AISUP5-1")).toBe(true);
    expect(JIRA_ISSUE_KEY.test("support")).toBe(false);
  });

  it("parseTicketsSearchResponse reads jira.issues not tickets", () => {
    const r = parseTicketsSearchResponse({
      jira: {
        issues: [{ id: "AISUP5-1", key: "AISUP5-1", title: "Timeout", source: "jira", body: "", state: "Open", labels: [], comments: [], url: "" }],
        mock: false,
      },
    });
    expect(r.tickets).toHaveLength(1);
    expect(r.tickets[0].key).toBe("AISUP5-1");
    expect(parseTicketsSearchResponse({ tickets: [{ key: "WRONG" }] }).tickets).toHaveLength(0);
  });

  it("parseTicketRefResponse returns full issue", () => {
    const issue = {
      id: "AISUP5-1",
      key: "AISUP5-1",
      title: "Playbook timeout",
      source: "jira" as const,
      body: "Details",
      state: "To Do",
      labels: [],
      comments: [],
      url: "https://example.atlassian.net/browse/AISUP5-1",
    };
    const r = parseTicketRefResponse({ issue, mock: false });
    expect(r.ticket?.key).toBe("AISUP5-1");
    expect(r.issue?.body).toBe("Details");
  });

  it("parseMcpDiscoveryResponse builds note from statuses", () => {
    const r = parseMcpDiscoveryResponse({
      statuses: [{ name: "jira", url: "http://x", transport: "http", connected: true, toolCount: 2 }],
      tools: [{ server: "jira", name: "search", isWrite: false }],
    });
    expect(r.tools).toHaveLength(1);
    expect(r.note).toMatch(/connected/);
  });

  it("parseWorkspaceSearchResponse reads results array", () => {
    expect(parseWorkspaceSearchResponse({ results: [{ id: "1" }] }).results).toHaveLength(1);
    expect(parseWorkspaceSearchResponse({ error: "fail" }).error).toBe("fail");
  });

  it("parseInvestigationsListResponse reads investigations array", () => {
    const r = parseInvestigationsListResponse({ investigations: [{ id: "inv-1", title: "Test" }] });
    expect(r.investigations[0].id).toBe("inv-1");
  });

  it("parseApiImportListResponse reads specs array", () => {
    const r = parseApiImportListResponse({ specs: [{ id: "cyware-ctix-api", name: "CTIX", endpoints: 42 }] });
    expect(r.specs[0].endpoints).toBe(42);
  });
});
