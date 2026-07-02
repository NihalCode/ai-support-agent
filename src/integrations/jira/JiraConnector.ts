import "server-only";

import { getJiraTickets } from "@/lib/support/connectors";
import { isTestMode } from "@/lib/test-mode";

import type { EnterpriseConnector, IntegrationHealthResult } from "../core/EnterpriseConnector";
import { healthResult } from "../core/EnterpriseConnector";
import {
  jiraCredentialsConfigured,
  resolveJiraCredentials,
} from "../core/resolveIntegrationCredentials";

export class JiraEnterpriseConnector implements EnterpriseConnector {
  type = "jira" as const;
  name = "Jira";

  async healthCheck(): Promise<IntegrationHealthResult> {
    const creds = await resolveJiraCredentials();
    if (!jiraCredentialsConfigured(creds)) {
      if (isTestMode()) {
        return healthResult(true, "Jira mock mode active", true);
      }
      return healthResult(false, "Jira is not connected");
    }
    const { connector, mock } = await getJiraTickets();
    if (mock) {
      return healthResult(false, "Jira not configured (using mock connector)", isTestMode());
    }
    const test = await connector.testConnection?.();
    if (test) {
      return healthResult(test.ok, test.detail ?? (test.ok ? "Connected" : "Health check failed"));
    }
    return healthResult(true, "Jira credentials present");
  }
}

export async function searchJiraIssues(query: string, limit = 10) {
  const { connector } = await getJiraTickets();
  return connector.searchIssues(query, limit);
}

export async function getJiraIssue(issueKey: string) {
  const { connector } = await getJiraTickets();
  return connector.getIssue(issueKey);
}
