import "server-only";

import { getZendeskTickets } from "@/lib/support/connectors";
import { isTestMode } from "@/lib/test-mode";

import type { EnterpriseConnector, IntegrationHealthResult } from "../core/EnterpriseConnector";
import { healthResult } from "../core/EnterpriseConnector";
import {
  resolveZendeskCredentials,
  zendeskCredentialsConfigured,
} from "../core/resolveIntegrationCredentials";

export class ZendeskEnterpriseConnector implements EnterpriseConnector {
  type = "zendesk" as const;
  name = "Zendesk";

  async healthCheck(): Promise<IntegrationHealthResult> {
    const creds = await resolveZendeskCredentials();
    if (!zendeskCredentialsConfigured(creds)) {
      if (isTestMode()) return healthResult(true, "Zendesk mock mode active", true);
      return healthResult(false, "Zendesk is not connected");
    }
    const { connector, mock } = await getZendeskTickets();
    if (mock) return healthResult(false, "Zendesk mock connector active", isTestMode());
    const test = await connector.testConnection?.();
    if (test) {
      return healthResult(test.ok, test.detail ?? (test.ok ? "Connected" : "Health check failed"));
    }
    return healthResult(true, "Zendesk credentials present");
  }
}

export async function searchZendeskTickets(query: string, limit = 10) {
  const { connector } = await getZendeskTickets();
  return connector.searchIssues(query, limit);
}

export async function getZendeskTicket(id: string) {
  const { connector } = await getZendeskTickets();
  return connector.getIssue(id);
}
