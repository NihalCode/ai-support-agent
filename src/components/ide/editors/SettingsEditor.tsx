"use client";

import { useState } from "react";

import { SettingsSidebar, type SettingsSection } from "../sidebars/SettingsSidebar";
import { IntegrationSettingsPanel } from "@/components/auth/IntegrationSettingsPanel";
import { UserManagementPanel } from "@/components/auth/UserManagementPanel";
import { useAuth } from "@/components/auth/AuthProvider";
import { CredentialSetup } from "@/components/workspace/CredentialSetup";
import { useWorkspace } from "../WorkspaceProvider";
import {
  AuditLogsPanel,
  IntegrationHealthPanel,
  KnowledgeSourcesPanel,
  NotificationsPanel,
  RetentionPanel,
  SetupChecklistPanel,
  SystemHealthPanel,
} from "./EnterprisePanels";

export function SettingsEditor() {
  const { isClientMode } = useWorkspace();
  const { hasPermission } = useAuth();
  const [section, setSection] = useState<SettingsSection>("integrations");
  const canManageUsers = hasPermission("users:read");
  const canAudit = hasPermission("audit:read");
  const developerMode = !isClientMode;

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
              Enterprise integration registry and health checks.
            </p>
            <IntegrationHealthPanel developerMode={developerMode} />
            <div style={{ marginTop: 24 }}>
              <IntegrationSettingsPanel />
            </div>
          </>
        )}
        {section === "health" && canAudit && (
          <>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>System health</h2>
            <SystemHealthPanel />
          </>
        )}
        {section === "audit" && canAudit && (
          <>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Audit logs</h2>
            <AuditLogsPanel />
          </>
        )}
        {section === "setup" && canAudit && (
          <>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Setup checklist</h2>
            <SetupChecklistPanel onNavigate={(s) => setSection(s as SettingsSection)} />
          </>
        )}
        {section === "knowledge" && (
          <>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Knowledge sources</h2>
            <KnowledgeSourcesPanel />
          </>
        )}
        {section === "notifications" && (
          <>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Notifications</h2>
            <NotificationsPanel />
          </>
        )}
        {section === "retention" && canAudit && (
          <>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Data retention</h2>
            <RetentionPanel />
          </>
        )}
        {section === "credentials" && (
          <>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Runtime credentials</h2>
            <CredentialSetup developerMode={developerMode} />
          </>
        )}
        {section === "users" && canManageUsers && (
          <>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>User management</h2>
            <UserManagementPanel />
          </>
        )}
      </div>
    </div>
  );
}
