import "server-only";

import { defaultOrgId } from "@/lib/auth/config";
import { getConfig } from "@/lib/support/config";
import { CredentialStore } from "./CredentialStore";
import type { IntegrationCredentialPayload } from "./IntegrationTypes";

function pick(...values: (string | null | undefined)[]): string | null {
  for (const v of values) {
    const t = v?.trim();
    if (t) return t;
  }
  return null;
}

export interface JiraCredentials {
  baseUrl: string | null;
  email: string | null;
  apiToken: string | null;
  projectKey: string | null;
}

export interface ZendeskCredentials {
  subdomain: string | null;
  email: string | null;
  apiToken: string | null;
}

export interface ConfluenceCredentials {
  baseUrl: string | null;
  email: string | null;
  apiToken: string | null;
  spaceKey: string | null;
}

export interface SlackCredentials {
  botToken: string | null;
  signingSecret: string | null;
}

async function loadStored(
  integrationId: "jira" | "zendesk" | "confluence" | "slack",
  orgId: string
): Promise<IntegrationCredentialPayload | null> {
  return CredentialStore.load(integrationId, orgId);
}

export async function resolveJiraCredentials(
  orgId = defaultOrgId()
): Promise<JiraCredentials> {
  const cfg = getConfig();
  const stored = await loadStored("jira", orgId);
  return {
    baseUrl: pick(stored?.baseUrl, cfg.jira.baseUrl),
    email: pick(stored?.email, cfg.jira.email),
    apiToken: pick(stored?.apiToken, cfg.jira.apiToken),
    projectKey: pick(stored?.projectKey, cfg.jira.projectKey),
  };
}

export function jiraCredentialsConfigured(c: JiraCredentials): boolean {
  return Boolean(c.baseUrl && c.email && c.apiToken);
}

export async function resolveZendeskCredentials(
  orgId = defaultOrgId()
): Promise<ZendeskCredentials> {
  const cfg = getConfig();
  const stored = await loadStored("zendesk", orgId);
  return {
    subdomain: pick(stored?.subdomain, cfg.zendesk.subdomain),
    email: pick(stored?.email, cfg.zendesk.email),
    apiToken: pick(stored?.apiToken, cfg.zendesk.apiToken),
  };
}

export function zendeskCredentialsConfigured(c: ZendeskCredentials): boolean {
  return Boolean(c.subdomain && c.email && c.apiToken);
}

export async function resolveConfluenceCredentials(
  orgId = defaultOrgId()
): Promise<ConfluenceCredentials> {
  const cfg = getConfig();
  const stored = await loadStored("confluence", orgId);
  return {
    baseUrl: pick(stored?.baseUrl, cfg.confluence.baseUrl),
    email: pick(stored?.email, cfg.confluence.email),
    apiToken: pick(stored?.apiToken, cfg.confluence.apiToken),
    spaceKey: pick(stored?.spaceKey, cfg.confluence.spaceKey),
  };
}

export function confluenceCredentialsConfigured(c: ConfluenceCredentials): boolean {
  return Boolean(c.baseUrl && c.email && c.apiToken);
}

export async function resolveSlackCredentials(
  orgId = defaultOrgId()
): Promise<SlackCredentials> {
  const cfg = getConfig();
  const stored = await loadStored("slack", orgId);
  return {
    botToken: pick(stored?.botToken, stored?.token, cfg.slack.botToken),
    signingSecret: pick(stored?.signingSecret, cfg.slack.signingSecret),
  };
}

export function slackCredentialsConfigured(c: SlackCredentials): boolean {
  return Boolean(c.botToken && c.signingSecret);
}
