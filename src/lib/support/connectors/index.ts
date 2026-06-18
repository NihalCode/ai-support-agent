import "server-only";

import type { RepoConnector, TicketConnector, RepoRef } from "../types";
import { getConfig, hasGitHub, hasJira } from "../config";
import { GitHubConnector, parseRepoUrl } from "./github";
import { JiraConnector } from "./jira";
import {
  MockRepoConnector,
  MockGitHubTicketConnector,
  MockJiraTicketConnector,
} from "./mock";
import { MOCK_REPO } from "./mock-data";

export { parseRepoUrl } from "./github";

/** Resolve a RepoRef from a user-provided URL, the default repo, or the mock. */
export function resolveRepoRef(repoUrl?: string): { ref: RepoRef; mock: boolean } {
  const cfg = getConfig();
  if (repoUrl && repoUrl.trim()) {
    const parsed = parseRepoUrl(repoUrl);
    if (parsed) return { ref: parsed, mock: !hasGitHub(cfg) };
  }
  if (hasGitHub(cfg)) {
    const parsed = parseRepoUrl(cfg.github.defaultRepo);
    if (parsed) return { ref: parsed, mock: false };
  }
  return { ref: MOCK_REPO, mock: true };
}

export function getRepoConnector(): { connector: RepoConnector; mock: boolean } {
  const cfg = getConfig();
  if (hasGitHub(cfg) && cfg.github.token) {
    return { connector: new GitHubConnector(cfg.github.token), mock: false };
  }
  return { connector: new MockRepoConnector(), mock: true };
}

/** GitHub Issues connector bound to a specific repo. */
export function getGitHubTickets(ref: RepoRef): { connector: TicketConnector; mock: boolean } {
  const cfg = getConfig();
  if (hasGitHub(cfg) && cfg.github.token) {
    const gh = new GitHubConnector(cfg.github.token);
    gh.setRepo(ref);
    return { connector: gh, mock: false };
  }
  return { connector: new MockGitHubTicketConnector(), mock: true };
}

export function getJiraTickets(): { connector: TicketConnector; mock: boolean } {
  const cfg = getConfig();
  if (hasJira(cfg) && cfg.jira.baseUrl && cfg.jira.email && cfg.jira.apiToken) {
    return {
      connector: new JiraConnector(cfg.jira.baseUrl, cfg.jira.email, cfg.jira.apiToken),
      mock: false,
    };
  }
  return { connector: new MockJiraTicketConnector(), mock: true };
}

/**
 * Pick the right ticket connector for a reference. Jira keys look like
 * "ABC-123"; GitHub refs look like "#123", "gh#123", or a number.
 */
export function ticketConnectorForRef(
  ref: string,
  repoRef: RepoRef
): { connector: TicketConnector; mock: boolean } {
  if (/^[A-Z][A-Z0-9]+-\d+$/.test(ref.trim())) return getJiraTickets();
  return getGitHubTickets(repoRef);
}

export { MOCK_REPO };
