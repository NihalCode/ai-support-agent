"use client";

import { useWorkspace } from "../WorkspaceProvider";

export function InvestigationsSidebar() {
  const { runCommand } = useWorkspace();
  return (
    <div style={{ padding: 8 }}>
      <button type="button" className="ide-tree-item" onClick={() => runCommand("investigate")}>
        + New investigation
      </button>
      <p style={{ padding: "8px 12px", color: "var(--muted)", fontSize: 12 }}>
        Investigations are persisted server-side when Redis/Upstash is configured. Open Investigation tab to continue a session.
      </p>
    </div>
  );
}
