import { describe, it, expect } from "vitest";
import { MockJiraTicketConnector } from "../connectors/mock";
import { suggestTicketMetadata } from "../suggest";
import type { NormalizedIssue } from "../types";

describe("Jira connector (mock) — production capabilities", () => {
  const jira = new MockJiraTicketConnector();

  it("advertises full capabilities", () => {
    expect(jira.capabilities).toEqual({
      canComment: true,
      canTransition: true,
      canLink: true,
      canCreate: true,
    });
  });

  it("reports a healthy connection", async () => {
    const r = await jira.testConnection();
    expect(r.ok).toBe(true);
  });

  it("reads an issue with title/body/comments", async () => {
    const all = await jira.searchIssues("", 1);
    expect(all.length).toBeGreaterThan(0);
    const one = await jira.getIssue(all[0].key!);
    expect(one?.title).toBeTruthy();
  });

  it("lists transitions", async () => {
    const t = await jira.listTransitions("PROJ-1");
    expect(t.map((x) => x.name)).toContain("Done");
  });

  it("drafts a comment / transition / link / create (mock)", async () => {
    expect((await jira.addComment("PROJ-1", "hi")).ok).toBe(true);
    expect((await jira.transitionIssue("PROJ-1", "Done")).ok).toBe(true);
    expect((await jira.linkIssues("PROJ-1", "PROJ-2", "blocks")).ok).toBe(true);
    const created = await jira.createIssue({ projectKey: "PROJ", summary: "x", description: "y", issueType: "Task" });
    expect(created.ok).toBe(true);
    expect(created.key).toMatch(/^PROJ-\d+$/);
  });
});

describe("suggestTicketMetadata", () => {
  const base: NormalizedIssue = {
    id: "PROJ-9",
    source: "jira",
    key: "PROJ-9",
    title: "",
    body: "",
    state: "Open",
    labels: [],
    comments: [],
    url: "",
  };

  it("suggests escalation + Highest for outage/data-loss", () => {
    const s = suggestTicketMetadata({ ...base, title: "Production down, data loss for all users" });
    expect(s.priority).toBe("Highest");
    expect(s.shouldEscalate).toBe(true);
  });

  it("labels auth + bug issues and does not escalate minor ones", () => {
    const s = suggestTicketMetadata({ ...base, title: "Login returns 401 error sometimes" });
    expect(s.labels).toEqual(expect.arrayContaining(["auth"]));
    expect(s.shouldEscalate).toBe(false);
  });

  it("falls back to needs-triage when nothing matches", () => {
    const s = suggestTicketMetadata({ ...base, title: "hello there" });
    expect(s.labels).toContain("needs-triage");
  });
});
