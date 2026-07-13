import type { ApprovalAction, ApprovalStatus, SafetyVerdict } from "../types";

/** Single internal company workspace — not multi-tenant SaaS. */
export const DEFAULT_WORKSPACE_ID = "default";

export type AuditTargetSystem =
  | "app"
  | "auth0"
  | "neon"
  | "jira"
  | "zendesk"
  | "confluence"
  | "slack"
  | "openai"
  | "pinecone"
  | "vercel"
  | "terminal"
  | "mcp";

export type AuditLogStatus =
  | "requested"
  | "approved"
  | "completed"
  | "failed"
  | "rejected";

export interface EnterpriseAuditLog {
  id: string;
  actorUserId: string;
  actorEmail?: string;
  action: string;
  targetSystem: AuditTargetSystem;
  targetId?: string;
  status: AuditLogStatus;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export type ApprovalActionType =
  | "create_jira_issue"
  | "update_jira_issue"
  | "comment_jira_issue"
  | "create_zendesk_ticket"
  | "send_zendesk_reply"
  | "add_zendesk_internal_note"
  | "send_slack_message"
  | "deploy_app"
  | "run_real_api_call"
  | "run_terminal_command"
  | "update_integration_settings";

export type ApprovalTargetSystem =
  | "jira"
  | "zendesk"
  | "slack"
  | "vercel"
  | "cyware_api"
  | "terminal"
  | "app";

export type RiskLevel = "low" | "medium" | "high";

export interface EnterpriseApprovalRequest {
  id: string;
  requestedByUserId: string;
  approvedByUserId?: string;
  actionType: ApprovalActionType;
  targetSystem: ApprovalTargetSystem;
  targetId?: string;
  riskLevel: RiskLevel;
  summary: string;
  payloadPreview: Record<string, unknown>;
  status: ApprovalStatus;
  /** Legacy executable action — required for executor. */
  action: ApprovalAction;
  safety: SafetyVerdict;
  preview: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  result?: string;
}

export type SystemHealthSource =
  | "auth0"
  | "neon"
  | "openai"
  | "pinecone"
  | "jira"
  | "zendesk"
  | "confluence"
  | "slack"
  | "mcp"
  | "build_app"
  | "agent"
  | "deployment";

export type SystemHealthSeverity = "info" | "warning" | "error" | "critical";

export interface SystemHealthEvent {
  id: string;
  source: SystemHealthSource;
  severity: SystemHealthSeverity;
  status: "open" | "resolved";
  title: string;
  message: string;
  technicalDetails?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface SlackConversation {
  id: string;
  slackTeamId: string;
  channelId: string;
  threadTs: string;
  slackUserId: string;
  appUserId?: string;
  investigationId?: string;
  investigationSessionId?: string;
  lastIntent?: string;
  messagesJson: string;
  createdAt: string;
  updatedAt: string;
}

export type KnowledgeSourceType =
  | "confluence"
  | "uploaded_doc"
  | "api_doc"
  | "postman"
  | "openapi"
  | "manual"
  | "zendesk";

export type KnowledgeSourceStatus = "indexed" | "syncing" | "failed" | "stale";

export interface KnowledgeSource {
  id: string;
  type: KnowledgeSourceType;
  name: string;
  externalId?: string;
  url?: string;
  status: KnowledgeSourceStatus;
  lastSyncedAt?: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export type IntegrationHealthStatus =
  | "connected"
  | "not_configured"
  | "error"
  | "degraded"
  | "mock";

export interface IntegrationHealthCard {
  integration: string;
  status: IntegrationHealthStatus;
  lastCheckedAt?: string;
  summary: string;
  requiredEnvVars?: string[];
  missingEnvVars?: string[];
  actions: Array<"test_connection" | "configure" | "disconnect" | "view_logs">;
}

export interface RetentionSettings {
  investigationRetentionDays?: number;
  slackConversationRetentionDays?: number;
  auditLogRetentionDays?: number;
  knowledgeSourceRefreshDays?: number;
}

export type NotificationLevel = "info" | "success" | "warning" | "error";

export interface AppNotification {
  id: string;
  userId: string;
  level: NotificationLevel;
  title: string;
  message: string;
  technicalMessage?: string;
  read: boolean;
  createdAt: string;
}

export interface SetupChecklistItem {
  id: string;
  label: string;
  description: string;
  status: "complete" | "pending" | "degraded";
  actionLabel?: string;
  settingsSection?: string;
}

export type InvestigationSourceSystem =
  | "manual"
  | "slack"
  | "zendesk"
  | "jira";

/** Extended investigation metadata stored alongside InvestigationObject. */
export interface InvestigationLinks {
  investigationId: string;
  sourceSystem?: InvestigationSourceSystem;
  zendeskTicketId?: string;
  jiraIssueKey?: string;
  slackThreadId?: string;
  confluenceSourceIds?: string[];
  customerSummary?: string;
  developerHandoff?: string;
  customerResponse?: string;
  rootCause?: string;
  confidence?: "low" | "medium" | "high";
  assignedToUserId?: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}
