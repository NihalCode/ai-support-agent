/** Analytics event categories for grouping dashboard queries. */
export type MetricsCategory =
  | "investigation"
  | "chat"
  | "rag"
  | "approval"
  | "integration"
  | "knowledge"
  | "auth"
  | "cql"
  | "api"
  | "draft"
  | "quality"
  | "system";

export type MetricsEventType =
  | "investigation.created"
  | "investigation.resolved"
  | "investigation.chat"
  | "chat.response"
  | "chat.stream"
  | "rag.retrieve"
  | "approval.created"
  | "approval.approved"
  | "approval.rejected"
  | "approval.executed"
  | "integration.jira.action"
  | "integration.zendesk.action"
  | "integration.slack.reply"
  | "knowledge.sync"
  | "auth.login_success"
  | "auth.login_blocked"
  | "cql.generate"
  | "cql.index"
  | "api.lookup"
  | "api.execute"
  | "draft.customer_response"
  | "draft.developer_handoff"
  | "quality.feedback";

export interface AnalyticsEvent {
  id: string;
  orgId: string;
  eventType: MetricsEventType | string;
  category: MetricsCategory;
  actorUserId?: string;
  actorRole?: string;
  durationMs?: number;
  success: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ContextUsageMetric {
  id: string;
  orgId: string;
  eventId?: string;
  investigationId?: string;
  chunksRetrieved: number;
  tokensEstimated?: number;
  namespaces?: string[];
  createdAt: string;
}

export interface TaskBaselines {
  investigation?: number;
  investigation_triage?: number;
  chat_response?: number;
  cql_generation?: number;
  api_lookup?: number;
  customer_response_draft?: number;
  developer_handoff_draft?: number;
  approval_review?: number;
  knowledge_sync?: number;
  [key: string]: number | undefined;
}

export interface MetricsSettings {
  orgId: string;
  enabled: boolean;
  retentionDays: number;
  taskBaselines: TaskBaselines;
  allowDeveloperView: boolean;
  allowSupportAgentView: boolean;
  updatedAt: string;
  updatedBy?: string;
}

export interface DailyMetricsRollup {
  orgId: string;
  date: string;
  metrics: RollupMetrics;
  computedAt: string;
}

export interface RollupMetrics {
  eventCount: number;
  successCount: number;
  failureCount: number;
  byCategory: Record<string, number>;
  byEventType: Record<string, number>;
  totalDurationMs: number;
  avgDurationMs: number;
  investigationsCreated: number;
  investigationsResolved: number;
  chatResponses: number;
  ragRetrievals: number;
  approvalsCreated: number;
  approvalsApproved: number;
  integrationActions: number;
  knowledgeSyncs: number;
  estimatedTimeSavedMinutes: number | null;
}

export interface TrackEventInput {
  eventType: MetricsEventType | string;
  category: MetricsCategory;
  actorUserId?: string;
  actorRole?: string;
  durationMs?: number;
  success?: boolean;
  metadata?: Record<string, unknown>;
  contextUsage?: {
    investigationId?: string;
    chunksRetrieved?: number;
    tokensEstimated?: number;
    namespaces?: string[];
  };
}

export type MetricsDateRange = "today" | "7d" | "30d" | "qtd" | "custom";

export interface MetricsQueryFilters {
  range?: MetricsDateRange;
  from?: string;
  to?: string;
  category?: MetricsCategory;
  eventType?: string;
  limit?: number;
}

export const DEFAULT_TASK_BASELINES: TaskBaselines = {
  investigation: 45,
  investigation_triage: 45,
  chat_response: 5,
  cql_generation: 15,
  api_lookup: 10,
  customer_response_draft: 20,
  developer_handoff_draft: 25,
  approval_review: 5,
  knowledge_sync: 30,
};

export const EVENT_TYPE_TO_BASELINE_KEY: Record<string, keyof TaskBaselines> = {
  "investigation.created": "investigation_triage",
  "investigation.resolved": "investigation_triage",
  "chat.response": "chat_response",
  "chat.stream": "chat_response",
  "cql.generate": "cql_generation",
  "api.lookup": "api_lookup",
  "api.execute": "api_lookup",
  "draft.customer_response": "customer_response_draft",
  "draft.developer_handoff": "developer_handoff_draft",
  "approval.created": "approval_review",
  "approval.approved": "approval_review",
  "knowledge.sync": "knowledge_sync",
};
