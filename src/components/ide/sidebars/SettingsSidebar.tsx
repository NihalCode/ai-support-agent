"use client";

import { useWorkspace } from "../WorkspaceProvider";

export function SettingsSidebar() {
  const { runCommand } = useWorkspace();
  return (
    <div style={{ padding: 8 }}>
      <button type="button" className="ide-tree-item" onClick={() => runCommand("credentials")}>
        Credentials
      </button>
      <button type="button" className="ide-tree-item" onClick={() => runCommand("settings")}>
        IDE Settings
      </button>
      <button type="button" className="ide-tree-item" onClick={() => runCommand("import-api")}>
        API imports
      </button>
    </div>
  );
}
