"use client";

import { productConfig } from "@/lib/product-config";
import { useAuth } from "@/components/auth/AuthProvider";
import { useWorkspace } from "../WorkspaceProvider";

export type SettingsSection =
  | "integrations"
  | "health"
  | "audit"
  | "setup"
  | "knowledge"
  | "notifications"
  | "retention"
  | "credentials"
  | "users";

export function SettingsSidebar({
  activeSection = "integrations",
  onSectionChange,
}: {
  activeSection?: SettingsSection;
  onSectionChange?: (section: SettingsSection) => void;
}) {
  const { runCommand, productMode, setProductMode, isClientMode } = useWorkspace();
  const { canUseDeveloperMode, hasPermission } = useAuth();
  const canManageUsers = hasPermission("users:read");
  const canAudit = hasPermission("audit:read");

  function nav(section: SettingsSection, label: string, testId: string) {
    const active = activeSection === section;
    return (
      <button
        type="button"
        className="ide-tree-item"
        data-testid={testId}
        style={active ? { background: "var(--sidebar-active, rgba(255,255,255,0.06))" } : undefined}
        onClick={() => onSectionChange?.(section)}
      >
        {label}
      </button>
    );
  }

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
            <option value="client">Support Mode — guided workflows</option>
            {canUseDeveloperMode && (
              <option value="developer">Developer / Admin Mode — full IDE tools</option>
            )}
          </select>
        </label>
        <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
          {isClientMode
            ? "Support Mode shows investigations, customer response, linked tickets, and friendly integration status."
            : "Developer / Admin Mode shows terminal, MCP, raw logs, env details, and system health."}
        </p>
      </section>
      <section>
        <h3 style={{ fontSize: 12, margin: "0 0 8px", color: "var(--muted)" }}>Admin</h3>
        {nav("integrations", "Integrations", "settings-nav-integrations")}
        {canAudit && nav("health", "System health", "settings-nav-health")}
        {canAudit && nav("audit", "Audit logs", "settings-nav-audit")}
        {canAudit && nav("setup", "Setup checklist", "settings-nav-setup")}
        {nav("knowledge", "Knowledge sources", "settings-nav-knowledge")}
        {nav("notifications", "Notifications", "settings-nav-notifications")}
        {canAudit && nav("retention", "Data retention", "settings-nav-retention")}
      </section>
      <section style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: 12, margin: "0 0 8px", color: "var(--muted)" }}>Setup</h3>
        {nav("credentials", "Runtime credentials", "settings-nav-credentials")}
        {canManageUsers && nav("users", "Users & roles", "settings-nav-users")}
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
