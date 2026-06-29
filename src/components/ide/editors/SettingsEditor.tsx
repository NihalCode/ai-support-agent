"use client";

import { useState } from "react";

import { IntegrationSettingsPanel } from "@/components/auth/IntegrationSettingsPanel";
import { UserManagementPanel } from "@/components/auth/UserManagementPanel";
import { useAuth } from "@/components/auth/AuthProvider";
import { CredentialSetup } from "@/components/workspace/CredentialSetup";
import { SettingsSidebar } from "../sidebars/SettingsSidebar";
import { useWorkspace } from "../WorkspaceProvider";

type SettingsSection = "integrations" | "credentials" | "users";

export function SettingsEditor() {
  const { isClientMode } = useWorkspace();
  const { hasPermission } = useAuth();
  const [section, setSection] = useState<SettingsSection>("integrations");
  const canManageUsers = hasPermission("users:read");

  return (
    <div
      data-testid="settings-editor"
      style={{ display: "grid", gridTemplateColumns: "minmax(220px, 280px) 1fr", gap: 24, alignItems: "start" }}
    >
      <SettingsSidebar activeSection={section} onSectionChange={setSection} />
      <div>
        {section === "integrations" && (
          <>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Integrations</h2>
            <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
              Enterprise integration registry and health checks. Legacy env credentials still apply.
            </p>
            <IntegrationSettingsPanel />
          </>
        )}
        {section === "credentials" && (
          <>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Runtime credentials</h2>
            <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
              Connect optional services. The product works in docs-only mode without credentials.
            </p>
            <CredentialSetup developerMode={!isClientMode} />
          </>
        )}
        {section === "users" && canManageUsers && (
          <>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>User management</h2>
            <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
              Assign roles after users sign in with Auth0. Roles are stored in the app, not in Auth0.
            </p>
            <UserManagementPanel />
          </>
        )}
      </div>
    </div>
  );
}
