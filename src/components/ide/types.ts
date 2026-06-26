/** IDE workspace types — Cursor-inspired layout, no proprietary branding. */

export type ActivityId =
  | "explorer"
  | "search"
  | "source-control"
  | "chat"
  | "investigations"
  | "api-registry"
  | "cql"
  | "jira"
  | "logs"
  | "mcp"
  | "settings";

export type EditorTabKind =
  | "welcome"
  | "investigation"
  | "investigation-object"
  | "diagnose"
  | "integrations"
  | "api-registry"
  | "endpoint"
  | "api-runner"
  | "cql"
  | "jira-ticket"
  | "logs"
  | "markdown-report"
  | "code-file"
  | "diff"
  | "mcp-config"
  | "credentials"
  | "settings";

export interface EditorTab {
  id: string;
  kind: EditorTabKind;
  title: string;
  payload?: Record<string, unknown>;
  dirty?: boolean;
}

export interface EditorGroup {
  id: string;
  tabs: EditorTab[];
  activeTabId: string | null;
}

export type EditorLayoutOrientation = "single" | "horizontal" | "vertical";

export interface EditorLayout {
  orientation: EditorLayoutOrientation;
  groups: EditorGroup[];
  activeGroupId: string;
}

export interface EditorOpenTarget {
  kind: EditorTabKind | string;
  tabId: string;
  title: string;
  payload?: Record<string, unknown>;
}

export type BottomPanelTab = "terminal" | "output" | "problems" | "logs" | "tests" | "mcp" | "imports" | "trace";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  toolCards?: ToolCallCardState[];
  at: string;
}

export interface ToolCallCardState {
  id: string;
  agent: string;
  action: string;
  status: "pending" | "running" | "success" | "error" | "skipped";
  summary: string;
  durationMs?: number;
  mock?: boolean;
  details?: string;
  evidenceLinks?: { label: string; tabId?: string }[];
}

export interface LayoutState {
  sidebarWidth: number;
  chatWidth: number;
  bottomHeight: number;
  sidebarVisible: boolean;
  chatVisible: boolean;
  bottomVisible: boolean;
}

export interface WorkspaceState {
  activity: ActivityId;
  layout: LayoutState;
  editorLayout: EditorLayout;
  /** @deprecated use editorLayout — kept for hydration migration */
  tabs?: EditorTab[];
  activeTabId?: string | null;
  bottomTab: BottomPanelTab;
  commandPaletteOpen: boolean;
  chatMessages: ChatMessage[];
  investigationSessionId: string | null;
  activeInvestigationId: string | null;
  problems: { id: string; severity: "error" | "warn"; message: string }[];
}

export const DEFAULT_LAYOUT: LayoutState = {
  sidebarWidth: 280,
  chatWidth: 380,
  bottomHeight: 200,
  sidebarVisible: true,
  chatVisible: true,
  bottomVisible: true,
};

export const SLASH_COMMANDS = [
  { cmd: "/diagnose", label: "Diagnose issue", action: "diagnose" },
  { cmd: "/investigate", label: "Start investigation", action: "investigate" },
  { cmd: "/import-api", label: "Import API source", action: "import-api" },
  { cmd: "/generate-api-call", label: "Generate API call", action: "api-runner" },
  { cmd: "/validate-cql", label: "Validate CQL", action: "cql" },
  { cmd: "/search-jira", label: "Search Jira", action: "jira" },
  { cmd: "/search-logs", label: "Search logs", action: "logs" },
  { cmd: "/check-version", label: "Check version history", action: "investigate" },
  { cmd: "/explain-code", label: "Explain code", action: "chat" },
  { cmd: "/suggest-patch", label: "Suggest patch", action: "investigate" },
  { cmd: "/create-jira-draft", label: "Create Jira draft", action: "investigate" },
  { cmd: "/customer-response", label: "Customer response", action: "investigate" },
  { cmd: "/developer-handoff", label: "Developer handoff", action: "investigate" },
  { cmd: "/export-report", label: "Export report", action: "investigate" },
] as const;
