"use client";

import type { ActivityId } from "./types";
import { useWorkspace } from "./WorkspaceProvider";

const ITEMS: { id: ActivityId; icon: string; title: string }[] = [
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
  const { state, setActivity, toggleChat } = useWorkspace();

  return (
    <nav className="ide-activity-bar" aria-label="Activity bar" data-testid="activity-bar">
      {ITEMS.map((item) => (
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
