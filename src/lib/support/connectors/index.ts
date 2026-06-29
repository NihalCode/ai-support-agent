import "server-only";

import type { KnowledgeConnector, RepoConnector, TicketConnector, RepoRef } from "../types";
import { getConfig, hasConfluence, hasGitHub, hasJira, hasZendesk } from "../config";
import { isTestMode } from "@/lib/test-mode";
import { GitHubConnector, parseRepoUrl } from "./github";
import { JiraConnector } from "./jira";
import { ConfluenceConnector, MockConfluenceConnector } from "./confluence";
import {
  MockRepoConnector,
  MockGitHubTicketConnector,
  MockJiraTicketConnector,
} from "./mock";
import { MockZendeskTicketConnector, ZendeskConnector } from "./zendesk";
import { MOCK_REPO } from "./mock-data";

export { parseRepoUrl } from "./github";

/**
 * Resolve a RepoRef from a user-provided URL, the default repo, or the mock.
 * When the user supplies a GitHub URL we always target that repo (public API
 * works without a token for read-only ingest).
 */
export function resolveRepoRef(repoUrl?: string): { ref: RepoRef; mock: boolean } {
  const cfg = getConfig();
  if (repoUrl?.trim()) {
    const parsed = parseRepoUrl(repoUrl);
    if (parsed) return { ref: parsed, mock: false };
  }
  if (hasGitHub(cfg)) {
    const parsed = parseRepoUrl(cfg.github.defaultRepo);
    if (parsed) return { ref: parsed, mock: false };
  }
  return { ref: MOCK_REPO, mock: true };
}

/** Real GitHub (token or public read) when a repo is known; otherwise mock demo data. */
export function getRepoConnector(ref?: RepoRef): { connector: RepoConnector; mock: boolean } {
  const cfg = getConfig();
  if (ref && (ref.owner !== MOCK_REPO.owner || ref.name !== MOCK_REPO.name)) {
    return { connector: new GitHubConnector(cfg.github.token), mock: false };
  }
  if (hasGitHub(cfg) && cfg.github.token) {
    return { connector: new GitHubConnector(cfg.github.token), mock: false };
  }
  return { connector: new MockRepoConnector(), mock: true };
}

/** GitHub Issues for a repo — public read without token; writes need GITHUB_TOKEN. */
export function getGitHubTickets(ref: RepoRef): { connector: TicketConnector; mock: boolean } {
  const cfg = getConfig();
  const isMockRepo = ref.owner === MOCK_REPO.owner && ref.name === MOCK_REPO.name;
  if (isMockRepo && !hasGitHub(cfg)) {
    return { connector: new MockGitHubTicketConnector(), mock: true };
  }
  const gh = new GitHubConnector(cfg.github.token);
  gh.setRepo(ref);
  return { connector: gh, mock: false };
}

export function getJiraTickets(): { connector: TicketConnector; mock: boolean } {
  if (isTestMode()) {
    return { connector: new MockJiraTicketConnector(), mock: true };
  }
  const cfg = getConfig();
  if (hasJira(cfg) && cfg.jira.baseUrl && cfg.jira.email && cfg.jira.apiToken) {
    return {
      connector: new JiraConnector(
        cfg.jira.baseUrl,
        cfg.jira.email,
        cfg.jira.apiToken,
        cfg.jira.projectKey
      ),
      mock: false,
    };
  }
  return { connector: new MockJiraTicketConnector(), mock: true };
}

export function getZendeskTickets(): { connector: TicketConnector; mock: boolean } {
  if (isTestMode()) {
    return { connector: new MockZendeskTicketConnector(), mock: true };
  }
  const cfg = getConfig();
  if (hasZendesk(cfg) && cfg.zendesk.subdomain && cfg.zendesk.email && cfg.zendesk.apiToken) {
    return {
      connector: new ZendeskConnector(
        cfg.zendesk.subdomain,
        cfg.zendesk.email,
        cfg.zendesk.apiToken
      ),
      mock: false,
    };
  }
  return { connector: new MockZendeskTicketConnector(), mock: true };
}

export function getConfluenceDocs(): { connector: KnowledgeConnector; mock: boolean } {
  if (isTestMode()) {
    return { connector: new MockConfluenceConnector(), mock: true };
  }
  const cfg = getConfig();
  if (
    hasConfluence(cfg) &&
    cfg.confluence.baseUrl &&
    cfg.confluence.email &&
    cfg.confluence.apiToken
  ) {
    return {
      connector: new ConfluenceConnector(
        cfg.confluence.baseUrl,
        cfg.confluence.email,
        cfg.confluence.apiToken,
        cfg.confluence.spaceKey
      ),
      mock: false,
    };
  }
  return { connector: new MockConfluenceConnector(), mock: true };
}

export function ticketConnectorForRef(
  ref: string,
  repoRef: RepoRef
): { connector: TicketConnector; mock: boolean } {
  if (/^[A-Z][A-Z0-9]+-\d+$/.test(ref.trim())) return getJiraTickets();
  if (/^ZD-\d+$/i.test(ref.trim())) return getZendeskTickets();
  return getGitHubTickets(repoRef);
}

export { MOCK_REPO };
