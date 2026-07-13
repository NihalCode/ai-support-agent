"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useWorkspace } from "./WorkspaceProvider";
import { SLASH_COMMANDS } from "./types";

const BASE_COMMANDS = [
  { id: "import-api", label: "Import API source" },
  { id: "import-api", label: "Import Postman collection" },
  { id: "import-api", label: "Import OpenAPI spec" },
  { id: "import-api", label: "Import docs URL" },
  { id: "api-registry", label: "Open API Registry" },
  { id: "cql", label: "Open CQL Workspace" },
  { id: "investigate", label: "Start Investigation" },
  { id: "diagnose", label: "Diagnose Current Error" },
  { id: "jira", label: "Search Jira" },
  { id: "logs", label: "Search Logs" },
  { id: "mcp", label: "Check MCP Health" },
  { id: "credentials", label: "Configure Credentials" },
  { id: "investigate", label: "Generate Customer Response" },
  { id: "investigate", label: "Generate Developer Handoff" },
  { id: "investigate", label: "Export Investigation Report" },
  { id: "settings", label: "Open Settings" },
  { id: "toggle-sidebar", label: "Toggle Sidebar" },
  { id: "toggle-bottom", label: "Toggle Bottom Panel" },
  { id: "toggle-chat", label: "Toggle AI Chat" },
  { id: "split-right", label: "Split Editor Right" },
  { id: "split-down", label: "Split Editor Down" },
  { id: "join-groups", label: "Join All Editor Groups" },
  ...SLASH_COMMANDS.map((s) => ({ id: s.action, label: `${s.cmd} — ${s.label}` })),
];

const ADMIN_COMMAND = { id: "administration", label: "Open Administration" };

export function CommandPalette() {
  const { state, setCommandPalette, runCommand } = useWorkspace();
  const { canAccessAdminDashboard } = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const wasOpenRef = useRef(false);

  const commands = useMemo(
    () => (canAccessAdminDashboard ? [...BASE_COMMANDS, ADMIN_COMMAND] : BASE_COMMANDS),
    [canAccessAdminDashboard]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [query, commands]);

  useEffect(() => {
    if (state.commandPaletteOpen && !wasOpenRef.current) {
      queueMicrotask(() => {
        setQuery("");
        setSelected(0);
      });
    }
    wasOpenRef.current = state.commandPaletteOpen;
  }, [state.commandPaletteOpen]);

  function closePalette() {
    setCommandPalette(false);
    setQuery("");
    setSelected(0);
  }

  function executeCommand(commandId: string) {
    closePalette();
    if (commandId === "administration") {
      router.push("/admin");
      return;
    }
    runCommand(commandId);
  }

  if (!state.commandPaletteOpen) return null;

  return (
    <div
      className="ide-command-palette-overlay"
      role="dialog"
      aria-label="Command palette"
      data-testid="command-palette"
      onClick={() => closePalette()}
    >
      <div className="ide-command-palette" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className="ide-command-input"
          placeholder="Type a command…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") closePalette();
            if (e.key === "ArrowDown") setSelected((s) => Math.min(s + 1, filtered.length - 1));
            if (e.key === "ArrowUp") setSelected((s) => Math.max(s - 1, 0));
            if (e.key === "Enter" && filtered[selected]) {
              executeCommand(filtered[selected].id);
            }
          }}
        />
        <div className="ide-command-list">
          {filtered.map((cmd, i) => (
            <button
              key={`${cmd.id}-${cmd.label}-${i}`}
              type="button"
              className={`ide-command-item ${i === selected ? "selected" : ""}`}
              onClick={() => executeCommand(cmd.id)}
            >
              {cmd.label}
            </button>
          ))}
          {filtered.length === 0 && <p className="ide-empty">No matching commands</p>}
        </div>
      </div>
    </div>
  );
}
