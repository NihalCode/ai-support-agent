"use client";

import { useWorkspace } from "../WorkspaceProvider";

export function SourceControlSidebar() {
  const { openTab } = useWorkspace();
  return (
    <div style={{ padding: 8 }}>
      <button
        type="button"
        className="ide-tree-item"
        onClick={() => openTab({ id: "integrations", kind: "integrations", title: "Integrations" })}
      >
        Approvals queue
      </button>
      <p style={{ fontSize: 11, color: "var(--muted)", padding: 8 }}>
        Patches and write actions require approval. Generate patches from Investigation or Diagnose tabs.
      </p>
    </div>
  );
}
