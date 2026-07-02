import type { IntegrationChipStatus } from "@/components/chat/IntegrationStatusChip";

export interface SupportStatusPayload {
  integrations?: {
    slack?: { configured?: boolean };
    zendesk?: { configured?: boolean };
    confluence?: { configured?: boolean };
    jira?: { configured?: boolean };
  };
}

export function chipStatusForIntegration(
  name: "Slack" | "Zendesk" | "Confluence" | "Jira",
  status: SupportStatusPayload | null,
  developerMode: boolean
): IntegrationChipStatus {
  const key = name.toLowerCase() as "slack" | "zendesk" | "confluence" | "jira";
  const configured = Boolean(status?.integrations?.[key]?.configured);
  if (name === "Jira" && !developerMode) return configured ? "connected" : "not_connected";
  if (name === "Jira" && developerMode) return configured ? "connected" : "developer_only";
  if (configured) return "connected";
  return "not_connected";
}

export function countConnected(status: SupportStatusPayload | null): number {
  if (!status?.integrations) return 0;
  return (["slack", "zendesk", "confluence", "jira"] as const).filter((k) =>
    Boolean(status.integrations?.[k]?.configured)
  ).length;
}
