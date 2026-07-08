"use client";

import { useWorkspace } from "./WorkspaceProvider";
import { ExplorerSidebar } from "./sidebars/ExplorerSidebar";
import { SearchSidebar } from "./sidebars/SearchSidebar";
import { ApiRegistrySidebar } from "./sidebars/ApiRegistrySidebar";
import { CqlSidebar } from "./sidebars/CqlSidebar";
import { JiraSidebar } from "./sidebars/JiraSidebar";
import { LogsSidebar } from "./sidebars/LogsSidebar";
import { McpSidebar } from "./sidebars/McpSidebar";
import { InvestigationsSidebar } from "./sidebars/InvestigationsSidebar";
import { SourceControlSidebar } from "./sidebars/SourceControlSidebar";

const TITLES: Record<string, string> = {
  explorer: "Explorer",
  search: "Search",
  "source-control": "Source Control",
  investigations: "Investigations",
  "api-registry": "API Registry",
  cql: "CQL",
  jira: "Jira",
  logs: "Logs",
  mcp: "MCP",
  settings: "Settings",
  chat: "AI Chat",
};

export function PrimarySidebar() {
  const { state } = useWorkspace();
  const { activity } = state;

  return (
    <>
      <div className="ide-sidebar-header" data-testid={`sidebar-header-${activity}`}>{TITLES[activity] ?? "Sidebar"}</div>
      {activity === "explorer" && <ExplorerSidebar />}
      {activity === "search" && <SearchSidebar />}
      {activity === "source-control" && <SourceControlSidebar />}
      {activity === "investigations" && <InvestigationsSidebar />}
      {activity === "api-registry" && <ApiRegistrySidebar />}
      {activity === "cql" && <CqlSidebar />}
      {activity === "jira" && <JiraSidebar />}
      {activity === "logs" && <LogsSidebar />}
      {activity === "mcp" && <McpSidebar />}
      {activity === "settings" && (
        <p style={{ padding: 12, color: "var(--muted)", fontSize: 12, lineHeight: 1.5 }}>
          Settings open in the editor. Use the sidebar there for integrations, personal preferences, audit logs, setup, and retention.
        </p>
      )}
      {activity === "chat" && (
        <p style={{ padding: 12, color: "var(--muted)", fontSize: 12 }}>Use the AI panel on the right for chat.</p>
      )}
    </>
  );
}
