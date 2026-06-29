"use client";

import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import type { IntegrationId } from "@/integrations/core/IntegrationTypes";

interface IntegrationRow {
  id: IntegrationId;
  name: string;
  category: string;
  configured: boolean;
  source: "env" | "store" | "mock";
}

export function IntegrationSettingsPanel() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission("integrations:write");
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);
  const [encryptionAvailable, setEncryptionAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations");
      const data = (await res.json()) as {
        integrations?: IntegrationRow[];
        credentialStore?: { encryptionAvailable?: boolean };
      };
      setIntegrations(data.integrations ?? []);
      setEncryptionAvailable(Boolean(data.credentialStore?.encryptionAvailable));
    } catch {
      setMessage("Could not load integrations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      {message && (
        <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }} data-testid="integration-settings-message">
          {message}
        </p>
      )}
      <div style={{ display: "grid", gap: 8 }}>
        {integrations.map((row) => (
          <div
            key={row.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "10px 12px",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 13,
            }}
            data-testid={`integration-row-${row.id}`}
          >
            <div>
              <strong>{row.name}</strong>
              <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 2 }}>
                {row.configured ? `Configured (${row.source})` : "Not configured — mock/offline"}
              </div>
            </div>
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
        ))}
      </div>
    </div>
  );
}
