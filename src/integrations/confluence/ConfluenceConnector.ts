import "server-only";

import { getConfluenceDocs } from "@/lib/support/connectors";
import { isTestMode } from "@/lib/test-mode";

import type { EnterpriseConnector, IntegrationHealthResult } from "../core/EnterpriseConnector";
import { healthResult } from "../core/EnterpriseConnector";
import {
  confluenceCredentialsConfigured,
  resolveConfluenceCredentials,
} from "../core/resolveIntegrationCredentials";

export class ConfluenceEnterpriseConnector implements EnterpriseConnector {
  type = "confluence" as const;
  name = "Confluence";

  async healthCheck(): Promise<IntegrationHealthResult> {
    const creds = await resolveConfluenceCredentials();
    if (!confluenceCredentialsConfigured(creds)) {
      if (isTestMode()) return healthResult(true, "Confluence mock mode active", true);
      return healthResult(false, "Confluence is not connected");
    }
    const { connector, mock } = await getConfluenceDocs();
    if (mock) return healthResult(false, "Confluence mock connector active", isTestMode());
    const test = await connector.testConnection?.();
    if (test) {
      return healthResult(test.ok, test.detail ?? (test.ok ? "Connected" : "Health check failed"));
    }
    return healthResult(true, "Confluence credentials present");
  }
}

export async function searchConfluencePages(query: string, limit = 10) {
  const { connector } = await getConfluenceDocs();
  return connector.searchDocuments(query, limit);
}

export async function getConfluencePage(id: string) {
  const { connector } = await getConfluenceDocs();
  return connector.getDocument(id);
}
