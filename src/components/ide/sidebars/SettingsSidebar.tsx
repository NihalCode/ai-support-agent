"use client";

import { productConfig } from "@/lib/product-config";
import { useWorkspace } from "../WorkspaceProvider";

export function SettingsSidebar() {
  const { runCommand, productMode, setProductMode } = useWorkspace();
  return (
    <div style={{ padding: 8 }} data-testid="settings-sidebar">
      <section style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 12, margin: "0 0 8px", color: "var(--muted)" }}>Experience</h3>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
          Mode
          <select
            value={productMode}
            onChange={(e) => setProductMode(e.target.value as "client" | "developer")}
            data-testid="settings-mode-select"
          >
            <option value="client">Client — guided, professional</option>
            <option value="developer">Developer — full IDE tools</option>
          </select>
        </label>
        <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
          {productMode === "client"
            ? "Client Mode hides terminal, MCP, agent trace, and internal labels."
            : "Developer Mode shows all advanced panels and integration details."}
        </p>
      </section>
      <section>
        <h3 style={{ fontSize: 12, margin: "0 0 8px", color: "var(--muted)" }}>Setup</h3>
        <button type="button" className="ide-tree-item" onClick={() => runCommand("credentials")}>
          Credentials
        </button>
        <button type="button" className="ide-tree-item" onClick={() => runCommand("settings")}>
          Integrations
        </button>
        {productMode === "developer" && (
          <button type="button" className="ide-tree-item" onClick={() => runCommand("import-api")}>
            API imports
          </button>
        )}
      </section>
      <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 16 }}>{productConfig.appSubtitle}</p>
    </div>
  );
}
