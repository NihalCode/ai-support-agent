import "server-only";

import type { KnowledgeConnector, RepoConnector, TicketConnector, RepoRef } from "../types";
import { getConfig, hasGitHub } from "../config";
import { isTestMode } from "@/lib/test-mode";
import {
  confluenceCredentialsConfigured,
  jiraCredentialsConfigured,
  resolveConfluenceCredentials,
  resolveJiraCredentials,
  resolveZendeskCredentials,
  zendeskCredentialsConfigured,
} from "@/integrations/core/resolveIntegrationCredentials";
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

export async function getJiraTickets(): Promise<{ connector: TicketConnector; mock: boolean }> {
  if (isTestMode()) {
    return { connector: new MockJiraTicketConnector(), mock: true };
  }
  const creds = await resolveJiraCredentials();
  if (jiraCredentialsConfigured(creds)) {
    return {
      connector: new JiraConnector(
        creds.baseUrl!,
        creds.email!,
        creds.apiToken!,
        creds.projectKey ?? undefined
      ),
      mock: false,
    };
  }
  return { connector: new MockJiraTicketConnector(), mock: true };
}

export async function getZendeskTickets(): Promise<{ connector: TicketConnector; mock: boolean }> {
  if (isTestMode()) {
    return { connector: new MockZendeskTicketConnector(), mock: true };
  }
  const creds = await resolveZendeskCredentials();
  if (zendeskCredentialsConfigured(creds)) {
    return {
      connector: new ZendeskConnector(creds.subdomain!, creds.email!, creds.apiToken!),
      mock: false,
    };
  }
  return { connector: new MockZendeskTicketConnector(), mock: true };
}

export async function getConfluenceDocs(): Promise<{
  connector: KnowledgeConnector;
  mock: boolean;
}> {
  if (isTestMode()) {
    return { connector: new MockConfluenceConnector(), mock: true };
  }
  const creds = await resolveConfluenceCredentials();
  if (confluenceCredentialsConfigured(creds)) {
    return {
      connector: new ConfluenceConnector(
        creds.baseUrl!,
        creds.email!,
        creds.apiToken!,
        creds.spaceKey ?? undefined
      ),
      mock: false,
    };
  }
  return { connector: new MockConfluenceConnector(), mock: true };
}

export async function ticketConnectorForRef(
  ref: string,
  repoRef: RepoRef
): Promise<{ connector: TicketConnector; mock: boolean }> {
  if (/^[A-Z][A-Z0-9]+-\d+$/.test(ref.trim())) return getJiraTickets();
  if (/^ZD-\d+$/i.test(ref.trim())) return getZendeskTickets();
  return getGitHubTickets(repoRef);
}

export { MOCK_REPO };
