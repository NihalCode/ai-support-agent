export type ChatMode = "instant" | "balanced" | "deep" | "developer";

export type UnifiedIntent =
  | "build_app"
  | "edit_app"
  | "fix_generated_app"
  | "explain_app"
  | "preview_or_deploy_app"
  | "investigate_support_issue"
  | "analyze_uploaded_file"
  | "search_knowledge"
  | "search_jira"
  | "search_zendesk"
  | "search_confluence"
  | "use_slack_context"
  | "generate_cql"
  | "analyze_cyber_artifact"
  | "draft_customer_response"
  | "draft_developer_handoff"
  | "request_approval"
  | "manage_integrations"
  | "debug_system"
  | "unknown";

export interface UnifiedChatInput {
  userId: string;
  conversationId: string;
  message: string;
  selectedMode: ChatMode;
  attachmentIds: string[];
  sessionId?: string;
  investigationId?: string;
  buildProjectId?: string;
  buildOk?: boolean | null;
  canUseDeveloperMode: boolean;
}

export interface UnifiedChatRoute {
  kind: string;
  primaryIntent: string;
  attachmentContextSummary?: string;
}

export interface UnifiedChatResult {
  route: UnifiedChatRoute;
  enrichedMessage: string;
  classificationSummary: string;
}
