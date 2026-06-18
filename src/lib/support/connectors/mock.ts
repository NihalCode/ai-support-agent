import type {
  RepoConnector,
  TicketConnector,
  TicketConnectorCapabilities,
  JiraCreateDraft,
  RepoRef,
  RepoFile,
  CommitInfo,
  NormalizedIssue,
} from "../types";
import {
  MOCK_FILES,
  MOCK_COMMITS,
  MOCK_GITHUB_ISSUES,
  MOCK_JIRA_ISSUES,
} from "./mock-data";

function score(text: string, query: string): number {
  const q = query.toLowerCase();
  const terms = q.split(/\s+/).filter((t) => t.length > 2);
  const hay = text.toLowerCase();
  let s = 0;
  for (const t of terms) if (hay.includes(t)) s += 1;
  return s;
}

export class MockRepoConnector implements RepoConnector {
  readonly id = "github-mock";
  readonly isMock = true;
  async listFiles(_ref: RepoRef): Promise<RepoFile[]> {
    return MOCK_FILES;
  }
  async getReadme(_ref: RepoRef): Promise<RepoFile | null> {
    return MOCK_FILES.find((f) => /^readme/i.test(f.path)) ?? null;
  }
  async listCommits(_ref: RepoRef, limit = 30): Promise<CommitInfo[]> {
    return MOCK_COMMITS.slice(0, limit);
  }
}

export class MockGitHubTicketConnector implements TicketConnector {
  readonly id = "github-mock";
  readonly isMock = true;
  readonly capabilities: TicketConnectorCapabilities = {
    canComment: true,
    canTransition: false,
    canLink: false,
    canCreate: false,
  };
  async testConnection() {
    return { ok: true, detail: "Mock GitHub (demo data — no token)" };
  }
  async getIssue(ref: string): Promise<NormalizedIssue | null> {
    const num = ref.replace(/[^0-9]/g, "");
    return (
      MOCK_GITHUB_ISSUES.find((i) => String(i.number) === num || i.id === ref) ??
      null
    );
  }
  async searchIssues(query: string, limit = 5): Promise<NormalizedIssue[]> {
    const scored = [...MOCK_GITHUB_ISSUES]
      .map((i) => ({ i, s: score(`${i.title} ${i.body}`, query) }))
      .sort((a, b) => b.s - a.s);
    const matched = scored.filter((x) => x.s > 0);
    // Broad/seed queries (no term match) should ingest everything.
    const source = matched.length ? matched : scored;
    return source.slice(0, limit).map((x) => x.i);
  }
  async addComment(ref: string, _body: string) {
    return {
      ok: true,
      mock: true,
      url: `https://github.com/acme/checkout-service/issues/${ref.replace(/[^0-9]/g, "")}#mock-comment`,
    };
  }
}

export class MockJiraTicketConnector implements TicketConnector {
  readonly id = "jira-mock";
  readonly isMock = true;
  readonly capabilities: TicketConnectorCapabilities = {
    canComment: true,
    canTransition: true,
    canLink: true,
    canCreate: true,
  };
  async testConnection() {
    return { ok: true, detail: "Mock Jira (demo data — set JIRA_* to go live)" };
  }
  async getIssue(ref: string): Promise<NormalizedIssue | null> {
    return MOCK_JIRA_ISSUES.find((i) => i.key === ref || i.id === ref) ?? null;
  }
  async searchIssues(query: string, limit = 5): Promise<NormalizedIssue[]> {
    const scored = [...MOCK_JIRA_ISSUES]
      .map((i) => ({ i, s: score(`${i.title} ${i.body}`, query) }))
      .sort((a, b) => b.s - a.s);
    const matched = scored.filter((x) => x.s > 0);
    const source = matched.length ? matched : scored;
    return source.slice(0, limit).map((x) => x.i);
  }
  async addComment(ref: string, _body: string) {
    return { ok: true, mock: true, url: `https://acme.atlassian.net/browse/${ref}#mock-comment` };
  }
  async listTransitions(_ref: string) {
    return [
      { id: "11", name: "To Do" },
      { id: "21", name: "In Progress" },
      { id: "31", name: "Done" },
    ];
  }
  async transitionIssue(ref: string, _transition: string) {
    return { ok: true, url: `https://acme.atlassian.net/browse/${ref}` };
  }
  async linkIssues(_from: string, _to: string, _linkType: string) {
    return { ok: true };
  }
  async createIssue(draft: JiraCreateDraft) {
    const key = `${draft.projectKey}-${Math.floor(100 + Math.random() * 900)}`;
    return { ok: true, key, url: `https://acme.atlassian.net/browse/${key}` };
  }
}
