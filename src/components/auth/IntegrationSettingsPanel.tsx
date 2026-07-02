"use client";

import { useCallback, useEffect, useState } from "react";

import { EnterpriseIntegrationCards } from "@/components/auth/EnterpriseIntegrationCards";
import { useAuth } from "@/components/auth/AuthProvider";
import type { IntegrationId } from "@/integrations/core/IntegrationTypes";
import type { CredentialFieldDef } from "@/integrations/core/integrationCredentialFields";

const ENTERPRISE_IDS = new Set(["slack", "confluence", "zendesk", "jira"]);

interface IntegrationRow {
  id: IntegrationId;
  name: string;
  category: string;
  configured: boolean;
  source: "env" | "store" | "mock";
  health: "unknown" | "healthy" | "degraded" | "error";
  detail?: string;
  lastCheckedAt?: string;
  metadata?: Record<string, unknown>;
  requiresDeveloperMode?: boolean;
}

export function IntegrationSettingsPanel() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission("integrations:write");
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);
  const [credentialFields, setCredentialFields] = useState<
    Partial<Record<IntegrationId, CredentialFieldDef[]>>
  >({});
  const [encryptionAvailable, setEncryptionAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<IntegrationId | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<IntegrationId, Record<string, string>>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations");
      const data = (await res.json()) as {
        integrations?: IntegrationRow[];
        credentialFields?: Partial<Record<IntegrationId, CredentialFieldDef[]>>;
        credentialStore?: { encryptionAvailable?: boolean };
      };
      setIntegrations(
        (data.integrations ?? []).map((row) => ({
          ...row,
          health: row.health ?? "unknown",
        }))
      );
      setCredentialFields(data.credentialFields ?? {});
      setEncryptionAvailable(Boolean(data.credentialStore?.encryptionAvailable));
    } catch {
      setMessage("Could not load integrations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  function draftFor(id: IntegrationId): Record<string, string> {
    return drafts[id] ?? {};
  }

  function setDraftField(id: IntegrationId, key: string, value: string) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? {}), [key]: value },
    }));
  }

  async function runHealthCheck(id: IntegrationId) {
    setBusyId(id);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrationId: id, action: "health_check" }),
      });
      const data = (await res.json()) as { health?: { ok: boolean; detail: string }; error?: string };
      if (!res.ok) {
        setMessage(data.error ?? "Health check failed");
        return;
      }
      setMessage(`${id}: ${data.health?.detail ?? "done"}`);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function saveCredentials(id: IntegrationId) {
    if (!encryptionAvailable) {
      setMessage("Set INTEGRATION_SECRET_KEY before saving credentials.");
      return;
    }
    const fields = credentialFields[id] ?? [];
    const credentials: Record<string, string> = {};
    for (const field of fields) {
      const value = draftFor(id)[field.key]?.trim();
      if (value) credentials[field.key] = value;
    }
    const required = fields.filter((f) => !f.optional);
    const missing = required.filter((f) => !credentials[f.key]);
    if (missing.length > 0) {
      setMessage(`Fill required fields: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }

    setBusyId(id);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrationId: id, action: "save", credentials }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(data.error ?? "Save failed");
        return;
      }
      setMessage(`${id}: credentials saved to encrypted store.`);
      setDrafts((prev) => ({ ...prev, [id]: {} }));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function deleteCredentials(id: IntegrationId) {
    setBusyId(id);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrationId: id, action: "delete" }),
      });
      const data = (await res.json()) as { error?: string; removed?: boolean };
      if (!res.ok) {
        setMessage(data.error ?? "Delete failed");
        return;
      }
      setMessage(data.removed ? `${id}: stored credentials removed.` : `${id}: no stored credentials.`);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <p style={{ color: "var(--muted)", fontSize: 13 }}>Loading integrations…</p>;
  }

  return (
    <div data-testid="integration-settings-panel">
      {!encryptionAvailable && canWrite && (
        <p style={{ fontSize: 12, color: "var(--warn, #b8860b)", marginBottom: 12 }}>
          Set INTEGRATION_SECRET_KEY to save credentials in the encrypted store. Env-based credentials still work.
        </p>
      )}
      <EnterpriseIntegrationCards
        integrations={integrations}
        credentialFields={credentialFields}
        encryptionAvailable={encryptionAvailable}
        onRefresh={load}
      />
      {message && (
        <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }} data-testid="integration-settings-message">
          {message}
        </p>
      )}
      <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>Other integrations</h3>
      <div style={{ display: "grid", gap: 8 }}>
        {integrations.filter((row) => !ENTERPRISE_IDS.has(row.id)).map((row) => {
          const fields = credentialFields[row.id] ?? [];
          const expanded = expandedId === row.id;
          const hasForm = canWrite && fields.length > 0;

          return (
            <div
              key={row.id}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 13,
                overflow: "hidden",
              }}
              data-testid={`integration-row-${row.id}`}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 12px",
                }}
              >
                <div>
                  <strong>{row.name}</strong>
                  <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 2 }}>
                    {row.configured ? `Configured (${row.source})` : "Not configured — mock/offline"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {hasForm && (
                    <button
                      type="button"
                      className="ide-tree-item"
                      style={{ width: "auto", padding: "4px 10px" }}
                      onClick={() => setExpandedId(expanded ? null : row.id)}
                      data-testid={`integration-configure-${row.id}`}
                    >
                      {expanded ? "Hide" : "Configure"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="ide-tree-item"
                    style={{ width: "auto", padding: "4px 10px" }}
                    disabled={busyId === row.id}
                    onClick={() => void runHealthCheck(row.id)}
                    data-testid={`integration-health-${row.id}`}
                  >
                    {busyId === row.id ? "…" : "Test"}
                  </button>
                </div>
              </div>

              {expanded && hasForm && (
                <div
                  style={{
                    padding: "0 12px 12px",
                    borderTop: "1px solid var(--border)",
                    display: "grid",
                    gap: 8,
                  }}
                  data-testid={`integration-form-${row.id}`}
                >
                  {fields.map((field) => (
                    <label key={field.key} style={{ display: "grid", gap: 4, fontSize: 12 }}>
                      <span>
                        {field.label}
                        {field.optional ? " (optional)" : ""}
                      </span>
                      <input
                        type={field.secret ? "password" : "text"}
                        autoComplete="off"
                        placeholder={field.placeholder ?? (field.secret ? "••••••••" : "")}
                        value={draftFor(row.id)[field.key] ?? ""}
                        onChange={(e) => setDraftField(row.id, field.key, e.target.value)}
                        data-testid={`integration-field-${row.id}-${field.key}`}
                        style={{
                          padding: "6px 8px",
                          borderRadius: 4,
                          border: "1px solid var(--border)",
                          background: "var(--bg)",
                          color: "var(--fg)",
                        }}
                      />
                    </label>
                  ))}
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <button
                      type="button"
                      className="ide-tree-item"
                      style={{ width: "auto", padding: "4px 12px" }}
                      disabled={busyId === row.id || !encryptionAvailable}
                      onClick={() => void saveCredentials(row.id)}
                      data-testid={`integration-save-${row.id}`}
                    >
                      Save credentials
                    </button>
                    {row.source === "store" && (
                      <button
                        type="button"
                        className="ide-tree-item"
                        style={{ width: "auto", padding: "4px 12px" }}
                        disabled={busyId === row.id}
                        onClick={() => void deleteCredentials(row.id)}
                        data-testid={`integration-delete-${row.id}`}
                      >
                        Remove stored
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
