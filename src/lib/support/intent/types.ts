/** Natural-language intent classification for unified chat routing. */

export type UserIntent =
  | "build_app"
  | "edit_app"
  | "explain_app"
  | "preview_app"
  | "deploy_app"
  | "unsupported_app_build_request"
  | "commit_changes"
  | "diagnose_support_issue"
  | "continue_investigation"
  | "search_api_docs"
  | "generate_api_request"
  | "validate_cql"
  | "generate_cql"
  | "run_api_dry_run"
  | "search_jira"
  | "search_logs"
  | "create_jira_ticket"
  | "update_jira_ticket"
  | "generate_customer_response"
  | "generate_developer_handoff"
  | "suggest_patch"
  | "run_tests"
  | "fix_error"
  | "configure_credentials"
  | "unknown";

export type IntentConfidence = "low" | "medium" | "high";

export type UserTechnicalLevel = "non_technical" | "semi_technical" | "technical";

export interface IntentEntities {
  appDescription?: string;
  editRequest?: string;
  supportIssue?: string;
  ticketIds?: string[];
  endpoint?: string;
  statusCode?: string;
  requestId?: string;
  timestamp?: string;
  apiProduct?: string;
  cqlQuery?: string;
  deployTarget?: "preview" | "production";
  requestedOutput?: "plain_english" | "technical" | "customer_response" | "developer_handoff";
}

export interface WorkspaceIntentContext {
  sessionId?: string | null;
  investigationId?: string | null;
  buildProjectId?: string | null;
  buildOk?: boolean | null;
  buildFailed?: boolean;
  pendingApproval?: boolean;
  lastAssistantAction?: string;
  activeTabKind?: string;
}

export interface IntentClassification {
  primaryIntent: UserIntent;
  secondaryIntents: UserIntent[];
  confidence: IntentConfidence;
  userTechnicalLevel: UserTechnicalLevel;
  extractedEntities: IntentEntities;
  needsClarification: boolean;
  clarificationQuestion?: string;
  clarificationChoices?: string[];
  recommendedRoute: string;
  planSummary?: string;
  forcedBySlash?: string;
}

export interface IntentScore {
  intent: UserIntent;
  score: number;
  reason: string;
}
