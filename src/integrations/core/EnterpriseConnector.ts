import type { IntegrationId } from "./IntegrationTypes";

export type EnterpriseConnectorType = Extract<
  IntegrationId,
  "slack" | "confluence" | "zendesk" | "jira"
>;

export interface IntegrationHealthResult {
  ok: boolean;
  status: "success" | "error";
  message: string;
  checkedAt: string;
  mock?: boolean;
}

export interface EnterpriseConnector {
  type: EnterpriseConnectorType;
  name: string;
  healthCheck(): Promise<IntegrationHealthResult>;
}

export function healthResult(
  ok: boolean,
  message: string,
  mock = false
): IntegrationHealthResult {
  return {
    ok,
    status: ok ? "success" : "error",
    message,
    checkedAt: new Date().toISOString(),
    mock: mock || undefined,
  };
}
