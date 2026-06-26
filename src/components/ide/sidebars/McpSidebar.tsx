"use client";

import { useEffect, useState } from "react";
import type { McpServerStatus, McpToolDescriptor } from "@/lib/support/types";
import { parseMcpDiscoveryResponse } from "@/lib/support/ide-api";
import { useWorkspace } from "../WorkspaceProvider";

export function McpSidebar() {
  const { openTab, setBottomTab } = useWorkspace();
  const [statuses, setStatuses] = useState<McpServerStatus[]>([]);
  const [tools, setTools] = useState<McpToolDescriptor[]>([]);
  const [note, setNote] = useState("Loading MCP status…");

  useEffect(() => {
    fetch("/api/support/mcp")
      .then(async (r) => {
        const data = await r.json();
        const parsed = parseMcpDiscoveryResponse(data);
        setStatuses(parsed.statuses);
        setTools(parsed.tools);
        setNote(parsed.note);
      })
      .catch(() => setNote("MCP status unavailable"));
  }, []);

  return (
    <div style={{ padding: 8 }} data-testid="mcp-sidebar">
      <button type="button" className="ide-tree-item" onClick={() => openTab({ id: "mcp-config", kind: "mcp-config", title: "MCP" })}>
        Open MCP config
      </button>
      <button type="button" className="ide-tree-item" onClick={() => setBottomTab("mcp")}>
        View MCP output
      </button>
      {note && (
        <p style={{ fontSize: 11, color: "var(--muted)", padding: 8 }} data-testid="mcp-sidebar-note">
          {note}
        </p>
      )}
      {statuses.map((s) => (
        <div key={s.name} className="ide-tree-item" style={{ cursor: "default", flexDirection: "column", alignItems: "flex-start" }}>
          <span>
            {s.name} · {s.connected ? `${s.toolCount} tools` : "offline"}
          </span>
          {s.error && <span style={{ fontSize: 10, color: "var(--red)" }}>{s.error}</span>}
        </div>
      ))}
      {tools.slice(0, 12).map((t) => (
        <div key={`${t.server}:${t.name}`} className="ide-tree-item" style={{ cursor: "default", fontSize: 11 }}>
          {t.server}/{t.name}
        </div>
      ))}
      {tools.length > 12 && (
        <p style={{ fontSize: 10, color: "var(--muted)", padding: "4px 12px" }}>+{tools.length - 12} more tools</p>
      )}
    </div>
  );
}
