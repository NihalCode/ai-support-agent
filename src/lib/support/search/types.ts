/** Workspace search result types. */

export type WorkspaceSearchSourceType =
  | "api-doc"
  | "postman"
  | "openapi"
  | "cql"
  | "code"
  | "jira"
  | "logs"
  | "investigation"
  | "snippet"
  | "workflow"
  | "release-note";

export type SearchMode = "keyword" | "semantic" | "hybrid";

export interface EditorOpenTarget {
  kind: string;
  tabId: string;
  title: string;
  payload?: Record<string, unknown>;
}

export interface WorkspaceSearchResult {
  id: string;
  title: string;
  sourceType: WorkspaceSearchSourceType;
  sourceName: string;
  product?: string;
  score?: number;
  matchedText: string;
  highlightedText?: string;
  metadata: Record<string, unknown>;
  openTarget: EditorOpenTarget;
}

export interface WorkspaceSearchFilters {
  sourceTypes?: WorkspaceSearchSourceType[];
  product?: string;
  specId?: string;
  method?: string;
  cqlSupport?: boolean;
  jiraStatus?: string;
  logSeverity?: string;
  statusCode?: number;
  since?: string;
}

export interface WorkspaceSearchRequest {
  query: string;
  mode?: SearchMode;
  filters?: WorkspaceSearchFilters;
  topK?: number;
}

export interface WorkspaceSearchResponse {
  results: WorkspaceSearchResult[];
  mode: SearchMode;
  degraded?: boolean;
  degradedReason?: string;
  usedMockStore?: boolean;
  usedOpenAI?: boolean;
}
