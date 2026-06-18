import { describe, it, expect } from "vitest";
import {
  MockRepoConnector,
  MockGitHubTicketConnector,
  MockJiraTicketConnector,
} from "../connectors/mock";
import { parseRepoUrl } from "../connectors/github";

describe("parseRepoUrl", () => {
  it("parses owner/name shorthand", () => {
    expect(parseRepoUrl("acme/checkout-service")).toEqual({
      owner: "acme",
      name: "checkout-service",
    });
  });
  it("parses full github URLs and strips .git", () => {
    expect(parseRepoUrl("https://github.com/vercel/next.js.git")).toEqual({
      owner: "vercel",
      name: "next.js",
    });
  });
  it("returns null for non-github URLs", () => {
    expect(parseRepoUrl("https://gitlab.com/a/b")).toBeNull();
  });
});

describe("MockRepoConnector", () => {
  it("lists files and finds the README", async () => {
    const c = new MockRepoConnector();
    const files = await c.listFiles({ owner: "acme", name: "checkout-service" });
    expect(files.length).toBeGreaterThan(0);
    const readme = await c.getReadme({ owner: "acme", name: "checkout-service" });
    expect(readme?.path.toLowerCase()).toContain("readme");
  });
});

describe("Mock ticket connectors", () => {
  it("fetches a GitHub issue by ref and searches", async () => {
    const c = new MockGitHubTicketConnector();
    const issue = await c.getIssue("gh#41");
    expect(issue?.title).toMatch(/404/);
    const results = await c.searchIssues("charge 404", 5);
    expect(results.length).toBeGreaterThan(0);
  });

  it("fetches a Jira ticket by key", async () => {
    const c = new MockJiraTicketConnector();
    const t = await c.getIssue("PAY-101");
    expect(t?.source).toBe("jira");
    expect(t?.title).toMatch(/webhook/i);
  });

  it("returns a mock url on addComment without throwing", async () => {
    const c = new MockGitHubTicketConnector();
    const res = await c.addComment("gh#41", "hello");
    expect(res.ok).toBe(true);
    expect(res.mock).toBe(true);
  });
});
