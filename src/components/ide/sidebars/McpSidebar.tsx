"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "../WorkspaceProvider";

export function McpSidebar() {
  const { openTab, setBottomTab } = useWorkspace();
  const [tools, setTools] = useState<{ name: string; description?: string }[]>([]);
  const [note, setNote] = useState("");

  useEffect(() => {
    fetch("/api/support/mcp")
      .then((r) => r.json())
      .then((d) => {
        setTools(d.tools ?? []);
        setNote(d.note ?? "");
      })
      .catch(() => setNote("MCP status unavailable"));
  }, []);

  return (
    <div style={{ padding: 8 }}>
      <button type="button" className="ide-tree-item" onClick={() => openTab({ id: "mcp-config", kind: "mcp-config", title: "MCP" })}>
        Open MCP config
      </button>
      <button type="button" className="ide-tree-item" onClick={() => setBottomTab("mcp")}>
        View MCP output
      </button>
      {note && <p style={{ fontSize: 11, color: "var(--muted)", padding: 8 }}>{note}</p>}
      {tools.map((t) => (
        <div key={t.name} className="ide-tree-item" style={{ cursor: "default" }}>
          {t.name}
        </div>
      ))}
    </div>
  );
}
