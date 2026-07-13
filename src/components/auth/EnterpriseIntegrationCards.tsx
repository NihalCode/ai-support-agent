"use client";

import { useRef, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { useWorkspace } from "@/components/ide/WorkspaceProvider";
import type { IntegrationId } from "@/integrations/core/IntegrationTypes";
import type { CredentialFieldDef } from "@/integrations/core/integrationCredentialFields";

const ENTERPRISE_IDS = ["slack", "confluence", "zendesk", "jira"] as const;
type EnterpriseId = (typeof ENTERPRISE_IDS)[number];

interface IntegrationRow {
  id: IntegrationId;
  name: string;
  configured: boolean;
  source: "env" | "store" | "mock";
  health: "unknown" | "healthy" | "degraded" | "error";
  detail?: string;
  lastCheckedAt?: string;
  metadata?: Record<string, unknown>;
  connectedByUserId?: string;
  requiresDeveloperMode?: boolean;
}

interface EnterpriseCardProps {
  row: IntegrationRow;
  fields: CredentialFieldDef[];
  canWrite: boolean;
  developerMode: boolean;
  encryptionAvailable: boolean;
  busy: boolean;
  onTest: (id: EnterpriseId) => void;
  onSave: (id: EnterpriseId, credentials: Record<string, string>, metadata?: Record<string, string>) => void;
  onDisconnect: (id: EnterpriseId) => void;
  onTestSlack?: (channel: string) => void;
  onSyncConfluence?: () => void;
  onSyncZendesk?: () => void;
}

function healthLabel(health: IntegrationRow["health"], configured: boolean, developerMode: boolean): string {
  if (!configured) return developerMode ? "Not connected (mock mode)" : "Not connected";
  if (health === "healthy") return "Connected";
  if (health === "error") return "Connection issue";
  if (health === "degraded") return "Degraded";
  return "Configured";
}

function EnterpriseCard({
  row,
  fields,
  canWrite,
  developerMode,
  encryptionAvailable,
  busy,
  onTest,
  onSave,
  onDisconnect,
  onTestSlack,
  onSyncConfluence,
  onSyncZendesk,
}: EnterpriseCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [slackChannel, setSlackChannel] = useState(
    String(row.metadata?.defaultChannelId ?? "")
  );

  const id = row.id as EnterpriseId;
  const hideJiraConfig = id === "jira" && !developerMode;

  return (
    <div
      data-testid={`enterprise-integration-${id}`}
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 14,
        background: "var(--panel, var(--bg))",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <strong style={{ fontSize: 15 }}>{row.name}</strong>
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 999,
                background:
                  row.health === "healthy"
                    ? "color-mix(in srgb, var(--accent) 15%, transparent)"
                    : "color-mix(in srgb, var(--muted) 20%, transparent)",
              }}
            >
              {healthLabel(row.health, row.configured, developerMode)}
            </span>
          </div>
          <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>
            {row.detail ??
              (row.configured
                ? `Source: ${developerMode ? row.source : "connected"}`
                : "Connect to enable live search, sync, and write workflows.")}
          </div>
          {row.lastCheckedAt && (
            <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 4 }}>
              Last checked {new Date(row.lastCheckedAt).toLocaleString()}
            </div>
          )}
          {row.metadata?.baseUrl != null && (
            <div style={{ fontSize: 11, marginTop: 4 }}>{String(row.metadata.baseUrl)}</div>
          )}
          {row.metadata?.emailMasked != null && (
            <div style={{ fontSize: 11, color: "var(--muted)" }}>{String(row.metadata.emailMasked)}</div>
          )}
          {hideJiraConfig && (
            <div style={{ fontSize: 12, marginTop: 8, color: "var(--muted)" }}>
              Jira integration is managed by your developer/admin team.
            </div>
          )}
          {developerMode && id === "slack" && (
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
              Event URL: /api/slack/events
              <br />
              Interactivity: /api/slack/interactions
            </div>
          )}
          {developerMode && id === "zendesk" && (
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
              Search: GET /api/integrations/zendesk/tickets?q=…
              <br />
              Sync: POST /api/integrations/zendesk/sync
              <br />
              Actions: POST /api/integrations/zendesk/actions
            </div>
          )}
          {developerMode && id === "confluence" && (
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
              Search: GET /api/integrations/confluence/pages?q=…
              <br />
              Sync: POST /api/integrations/confluence/sync
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {canWrite && !hideJiraConfig && fields.length > 0 && (
            <button
              type="button"
              className="ide-tree-item"
              style={{ width: "auto", padding: "4px 10px" }}
              onClick={() => setExpanded((v) => !v)}
              data-testid={`enterprise-configure-${id}`}
            >
              {expanded ? "Close" : row.configured ? "Edit" : "Configure"}
            </button>
          )}
          <button
            type="button"
            className="ide-tree-item"
            style={{ width: "auto", padding: "4px 10px" }}
            disabled={busy}
            onClick={() => onTest(id)}
            data-testid={`enterprise-test-${id}`}
          >
            Test
          </button>
        </div>
      </div>

      {expanded && canWrite && !hideJiraConfig && (
        <div style={{ marginTop: 12, display: "grid", gap: 8 }} data-testid={`enterprise-form-${id}`}>
          {!encryptionAvailable && (
            <p style={{ fontSize: 12, color: "var(--warn, #b8860b)", margin: 0 }}>
              Set INTEGRATION_SECRET_KEY before saving credentials.
            </p>
          )}
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
                value={draft[field.key] ?? ""}
                onChange={(e) => setDraft((prev) => ({ ...prev, [field.key]: e.target.value }))}
                data-testid={`enterprise-field-${id}-${field.key}`}
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
          {id === "slack" && (
            <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
              <span>Default channel ID (optional)</span>
              <input
                value={draft.defaultChannelId ?? slackChannel}
                onChange={(e) => {
                  setSlackChannel(e.target.value);
                  setDraft((prev) => ({ ...prev, defaultChannelId: e.target.value }));
                }}
                placeholder="C01234567"
                style={{
                  padding: "6px 8px",
                  borderRadius: 4,
                  border: "1px solid var(--border)",
                }}
              />
            </label>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="ide-tree-item"
              style={{ width: "auto", padding: "4px 12px" }}
              disabled={busy || !encryptionAvailable}
              onClick={() =>
                onSave(
                  id,
                  draft,
                  id === "slack" ? { defaultChannelId: slackChannel } : undefined
                )
              }
              data-testid={`enterprise-save-${id}`}
            >
              Save
            </button>
            {row.source === "store" && (
              <button
                type="button"
                className="ide-tree-item"
                style={{ width: "auto", padding: "4px 12px" }}
                disabled={busy}
                onClick={() => onDisconnect(id)}
                data-testid={`enterprise-disconnect-${id}`}
              >
                Disconnect
              </button>
            )}
            {id === "slack" && onTestSlack && slackChannel && (
              <button
                type="button"
                className="ide-tree-item"
                style={{ width: "auto", padding: "4px 12px" }}
                disabled={busy}
                onClick={() => onTestSlack(slackChannel)}
              >
                Send test message
              </button>
            )}
            {id === "confluence" && onSyncConfluence && row.configured && (
              <button
                type="button"
                className="ide-tree-item"
                style={{ width: "auto", padding: "4px 12px" }}
                disabled={busy}
                onClick={onSyncConfluence}
                data-testid="enterprise-confluence-sync"
              >
                Sync now
              </button>
            )}
            {id === "zendesk" && onSyncZendesk && row.configured && (
              <button
                type="button"
                className="ide-tree-item"
                style={{ width: "auto", padding: "4px 12px" }}
                disabled={busy}
                onClick={onSyncZendesk}
                data-testid="enterprise-zendesk-sync"
              >
                Sync now
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function EnterpriseIntegrationCards({
  integrations,
  credentialFields,
  encryptionAvailable,
  onRefresh,
}: {
  integrations: IntegrationRow[];
  credentialFields: Partial<Record<IntegrationId, CredentialFieldDef[]>>;
  encryptionAvailable: boolean;
  onRefresh: () => Promise<void>;
}) {
  const { hasPermission, canUseDeveloperMode } = useAuth();
  const { isClientMode } = useWorkspace();
  const developerMode = canUseDeveloperMode && !isClientMode;
  const canWrite = hasPermission("integrations:write");

  function canConfigure(id: EnterpriseId): boolean {
    if (id === "jira") return developerMode && canUseDeveloperMode;
    return canWrite;
  }
  const [busyId, setBusyId] = useState<string | null>(null);
  const actionInFlightRef = useRef(false);
  const [message, setMessage] = useState<string | null>(null);

  const enterpriseRows = integrations.filter((r) =>
    (ENTERPRISE_IDS as readonly string[]).includes(r.id) && (r.id !== "jira" || developerMode)
  );

  async function runGuarded<T>(id: EnterpriseId | null, fn: () => Promise<T>): Promise<T | undefined> {
    if (actionInFlightRef.current) return undefined;
    actionInFlightRef.current = true;
    if (id) setBusyId(id);
    try {
      return await fn();
    } finally {
      actionInFlightRef.current = false;
      setBusyId(null);
    }
  }

  async function runTest(id: EnterpriseId) {
    await runGuarded(id, async () => {
      setMessage(null);
      const res = await fetch(`/api/integrations/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const data = (await res.json()) as { health?: { detail?: string; ok?: boolean }; error?: string };
      if (!res.ok) {
        setMessage(data.error ?? "Test failed");
        return;
      }
      setMessage(`${id}: ${data.health?.detail ?? "done"}`);
      await onRefresh();
    });
  }

  async function save(id: EnterpriseId, credentials: Record<string, string>, metadata?: Record<string, string>) {
    await runGuarded(id, async () => {
      setMessage(null);
      const res = await fetch(`/api/integrations/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "configure", credentials, metadata }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(data.error ?? "Save failed");
        return;
      }
      setMessage(`${id}: saved securely.`);
      await onRefresh();
    });
  }

  async function disconnect(id: EnterpriseId) {
    await runGuarded(id, async () => {
      const res = await fetch(`/api/integrations/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) setMessage(data.error ?? "Disconnect failed");
      else setMessage(`${id}: disconnected.`);
      await onRefresh();
    });
  }

  async function testSlack(channel: string) {
    await runGuarded("slack", async () => {
      const res = await fetch("/api/integrations/slack/test-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, text: "AI Support Studio connectivity test" }),
      });
      const data = (await res.json()) as { detail?: string; error?: string };
      setMessage(data.detail ?? data.error ?? "Sent");
    });
  }

  async function syncConfluence() {
    await runGuarded("confluence", async () => {
      const res = await fetch("/api/integrations/confluence/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await res.json()) as {
        error?: string;
        skipped?: boolean;
        reason?: string;
        result?: { upserted?: number };
      };
      if (!res.ok) setMessage(data.error ?? "Sync failed");
      else if (data.skipped) setMessage(data.reason ?? "Sync already in progress.");
      else setMessage(`Confluence sync complete (${data.result?.upserted ?? 0} chunks).`);
    });
  }

  async function syncZendesk() {
    await runGuarded("zendesk", async () => {
      const res = await fetch("/api/integrations/zendesk/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await res.json()) as {
        error?: string;
        skipped?: boolean;
        reason?: string;
        result?: { ticketsStored?: number; upserted?: number };
      };
      if (!res.ok) setMessage(data.error ?? "Sync failed");
      else if (data.skipped) setMessage(data.reason ?? "Sync already in progress.");
      else
        setMessage(
          `Zendesk sync complete (${data.result?.ticketsStored ?? 0} tickets, ${data.result?.upserted ?? 0} chunks).`
        );
    });
  }

  return (
    <div data-testid="enterprise-integration-cards" style={{ display: "grid", gap: 12, marginBottom: 24 }}>
      <h3 style={{ margin: "0 0 4px", fontSize: 14 }}>Slack, Confluence, Zendesk & Jira</h3>
      {message && (
        <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }} data-testid="enterprise-integration-message">
          {message}
        </p>
      )}
      {enterpriseRows.map((row) => (
        <EnterpriseCard
          key={row.id}
          row={row}
          fields={credentialFields[row.id] ?? []}
          canWrite={canConfigure(row.id as EnterpriseId)}
          developerMode={developerMode}
          encryptionAvailable={encryptionAvailable}
          busy={busyId === row.id}
          onTest={runTest}
          onSave={save}
          onDisconnect={disconnect}
          onTestSlack={row.id === "slack" ? testSlack : undefined}
          onSyncConfluence={row.id === "confluence" ? syncConfluence : undefined}
          onSyncZendesk={row.id === "zendesk" ? syncZendesk : undefined}
        />
      ))}
    </div>
  );
}
