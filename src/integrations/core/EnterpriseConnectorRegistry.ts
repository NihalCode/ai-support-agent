import "server-only";

import type { IntegrationId } from "./IntegrationTypes";
import { ConfluenceEnterpriseConnector } from "../confluence/ConfluenceConnector";
import { JiraEnterpriseConnector } from "../jira/JiraConnector";
import { SlackEnterpriseConnector } from "../slack/SlackConnector";
import { ZendeskEnterpriseConnector } from "../zendesk/ZendeskConnector";
import type { EnterpriseConnector } from "./EnterpriseConnector";

const CONNECTORS: Partial<Record<IntegrationId, () => EnterpriseConnector>> = {
  slack: () => new SlackEnterpriseConnector(),
  confluence: () => new ConfluenceEnterpriseConnector(),
  zendesk: () => new ZendeskEnterpriseConnector(),
  jira: () => new JiraEnterpriseConnector(),
};

export function getEnterpriseConnector(id: IntegrationId): EnterpriseConnector | null {
  const factory = CONNECTORS[id];
  return factory ? factory() : null;
}

export function listEnterpriseConnectors(): EnterpriseConnector[] {
  return (Object.keys(CONNECTORS) as IntegrationId[])
    .map((id) => getEnterpriseConnector(id))
    .filter(Boolean) as EnterpriseConnector[];
}
