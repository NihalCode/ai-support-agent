"use client";

import { CredentialSetup } from "@/components/workspace/CredentialSetup";
import { SettingsSidebar } from "../sidebars/SettingsSidebar";
import { useWorkspace } from "../WorkspaceProvider";

export function SettingsEditor() {
  const { isClientMode } = useWorkspace();
  return (
    <div
      data-testid="settings-editor"
      style={{ display: "grid", gridTemplateColumns: "minmax(220px, 280px) 1fr", gap: 24, alignItems: "start" }}
    >
      <SettingsSidebar />
      <div>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Integrations</h2>
        <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
          Connect optional services. The product works in docs-only mode without credentials.
        </p>
        <CredentialSetup developerMode={!isClientMode} />
      </div>
    </div>
  );
}
