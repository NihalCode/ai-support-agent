"use client";

import type { ActivityId } from "./types";
import { useWorkspace } from "./WorkspaceProvider";

const CLIENT_ITEMS: { id: ActivityId; icon: string; label: string }[] = [
  { id: "home", icon: "🏠", label: "Home" },
  { id: "build-app", icon: "🛠", label: "Build" },
  { id: "investigations", icon: "🔬", label: "Investigate" },
  { id: "api-registry", icon: "📡", label: "APIs" },
  { id: "deployments", icon: "🚀", label: "Deploy" },
  { id: "settings", icon: "⚙", label: "Settings" },
];

const DEVELOPER_ITEMS: { id: ActivityId; icon: string; title: string }[] = [
  { id: "home", icon: "🏠", title: "Home" },
  { id: "explorer", icon: "📁", title: "Explorer" },
  { id: "search", icon: "🔎", title: "Search" },
  { id: "source-control", icon: "⎇", title: "Source Control" },
  { id: "chat", icon: "💬", title: "AI Chat" },
  { id: "investigations", icon: "🔬", title: "Investigations" },
  { id: "api-registry", icon: "📡", title: "API Registry" },
  { id: "cql", icon: "⌗", title: "CQL" },
  { id: "build-app", icon: "🛠", title: "Build App" },
  { id: "deployments", icon: "🚀", title: "Deployments" },
  { id: "jira", icon: "🎫", title: "Jira" },
  { id: "logs", icon: "📋", title: "Logs" },
  { id: "mcp", icon: "🔌", title: "MCP" },
  { id: "settings", icon: "⚙", title: "Settings" },
];

export function ActivityBar() {
  const { state, setActivity, toggleChat, isClientMode } = useWorkspace();

  if (isClientMode) {
    return (
      <nav className="ide-activity-bar ide-activity-bar--client" aria-label="Navigation" data-testid="activity-bar">
        {CLIENT_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`ide-activity-btn ide-activity-btn--labeled ${state.activity === item.id ? "active" : ""}`}
            title={item.label}
            aria-label={item.label}
            data-testid={`activity-${item.id}`}
            onClick={() => setActivity(item.id)}
          >
            <span className="ide-activity-icon">{item.icon}</span>
            <span className="ide-activity-label">{item.label}</span>
          </button>
        ))}
      </nav>
    );
  }

  return (
    <nav className="ide-activity-bar" aria-label="Activity bar" data-testid="activity-bar">
      {DEVELOPER_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`ide-activity-btn ${state.activity === item.id ? "active" : ""}`}
          title={item.title}
          aria-label={item.title}
          data-testid={`activity-${item.id}`}
          onClick={() => {
            if (item.id === "chat") toggleChat();
            else setActivity(item.id);
          }}
        >
          {item.icon}
        </button>
      ))}
    </nav>
  );
}
