"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  EnterpriseAuditLog,
  IntegrationHealthCard,
  KnowledgeSource,
  SetupChecklistItem,
  SystemHealthEvent,
} from "@/lib/support/enterprise/types";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

function statusColor(status: string): string {
  if (status === "connected" || status === "complete" || status === "indexed") return "#22c55e";
  if (status === "degraded" || status === "mock" || status === "syncing") return "#eab308";
  if (status === "error" || status === "failed") return "#ef4444";
  return "var(--muted)";
}

export function IntegrationHealthPanel({ developerMode }: { developerMode: boolean }) {
  const [cards, setCards] = useState<IntegrationHealthCard[]>([]);
  const [summary, setSummary] = useState("");
  const [degraded, setDegraded] = useState<Array<{ friendly: string; technical?: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<{
      integrations: IntegrationHealthCard[];
      supportSummary: string;
      degraded: Array<{ friendly: string; technical?: string }>;
    }>(`/api/support/enterprise/health?developer=${developerMode}`)
      .then((data) => {
        setCards(data.integrations);
        setSummary(data.supportSummary);
        setDegraded(data.degraded);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load health"));
  }, [developerMode]);

  if (error) return <p style={{ color: "#ef4444" }}>{error}</p>;

  return (
    <div data-testid="integration-health-panel">
      <p style={{ color: "var(--muted)", fontSize: 13 }}>{summary}</p>
      {!developerMode && degraded.length > 0 && (
        <ul style={{ fontSize: 13, paddingLeft: 18 }}>
          {degraded.map((d, i) => (
            <li key={i}>{d.friendly}</li>
          ))}
        </ul>
      )}
      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        {cards.map((card) => (
          <div
            key={card.integration}
            data-testid={`health-card-${card.integration.toLowerCase().replace(/\s+/g, "-")}`}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong>{card.integration}</strong>
              <span style={{ color: statusColor(card.status), fontSize: 12 }}>{card.status}</span>
            </div>
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted)" }}>{card.summary}</p>
            {developerMode && card.missingEnvVars && card.missingEnvVars.length > 0 && (
              <p style={{ fontSize: 12, marginTop: 8 }}>Missing: {card.missingEnvVars.join(", ")}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SystemHealthPanel() {
  const [events, setEvents] = useState<SystemHealthEvent[]>([]);

  const load = useCallback(() => {
    fetchJson<{ systemHealth: SystemHealthEvent[] }>("/api/support/enterprise/health?developer=true")
      .then((d) => setEvents(d.systemHealth))
      .catch(() => setEvents([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function resolve(id: string) {
    await fetchJson("/api/support/enterprise/health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "resolve_health", id }),
    });
    load();
  }

  return (
    <div data-testid="system-health-panel">
      {events.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: 13 }}>No open system health events.</p>
      ) : (
        events.map((e) => (
          <div key={e.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <strong>{e.title}</strong>
            <span style={{ marginLeft: 8, fontSize: 12, color: statusColor(e.severity) }}>{e.severity}</span>
            <p style={{ fontSize: 13, color: "var(--muted)" }}>{e.message}</p>
            {e.technicalDetails && (
              <pre style={{ fontSize: 11, overflow: "auto" }}>{e.technicalDetails}</pre>
            )}
            <button type="button" className="ide-btn" onClick={() => resolve(e.id)}>
              Resolve
            </button>
          </div>
        ))
      )}
    </div>
  );
}

export function AuditLogsPanel() {
  const [entries, setEntries] = useState<EnterpriseAuditLog[]>([]);
  const [actionFilter, setActionFilter] = useState("");

  useEffect(() => {
    const q = actionFilter ? `?action=${encodeURIComponent(actionFilter)}` : "";
    fetchJson<{ entries: EnterpriseAuditLog[] }>(`/api/support/audit${q}`)
      .then((d) => setEntries(d.entries as EnterpriseAuditLog[]))
      .catch(() => setEntries([]));
  }, [actionFilter]);

  return (
    <div data-testid="audit-logs-panel">
      <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, fontSize: 13 }}>
        Filter action
        <input value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} />
      </label>
      <div style={{ maxHeight: 480, overflow: "auto" }}>
        {entries.map((e) => (
          <div key={e.id} style={{ borderBottom: "1px solid var(--border)", padding: "8px 0", fontSize: 12 }}>
            <div>
              <strong>{e.action}</strong> · {e.targetSystem} · {e.status}
            </div>
            <div style={{ color: "var(--muted)" }}>
              {e.actorEmail ?? e.actorUserId} · {new Date(e.createdAt).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SetupChecklistPanel({ onNavigate }: { onNavigate?: (section: string) => void }) {
  const [items, setItems] = useState<SetupChecklistItem[]>([]);
  const [progress, setProgress] = useState({ complete: 0, total: 0, percent: 0 });

  useEffect(() => {
    fetchJson<{ items: SetupChecklistItem[]; progress: typeof progress }>("/api/support/enterprise/setup")
      .then((d) => {
        setItems(d.items);
        setProgress(d.progress);
      })
      .catch(() => undefined);
  }, []);

  return (
    <div data-testid="setup-checklist-panel">
      <p style={{ fontSize: 13 }}>
        Progress: {progress.complete}/{progress.total} ({progress.percent}%)
      </p>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {items.map((item) => (
          <li
            key={item.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              padding: "10px 0",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div>
              <strong>{item.label}</strong>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--muted)" }}>{item.description}</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{ color: statusColor(item.status), fontSize: 12 }}>{item.status}</span>
              {item.settingsSection && onNavigate && (
                <button
                  type="button"
                  className="ide-btn"
                  style={{ display: "block", marginTop: 6 }}
                  onClick={() => onNavigate(item.settingsSection!)}
                >
                  Open
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function KnowledgeSourcesPanel() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(() => {
    fetchJson<{ sources: KnowledgeSource[] }>("/api/support/enterprise/knowledge")
      .then((d) => setSources(d.sources))
      .catch(() => setSources([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function syncConfluence() {
    setSyncing(true);
    try {
      await fetchJson("/api/support/enterprise/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "sync_confluence" }),
      });
      load();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div data-testid="knowledge-sources-panel">
      <button type="button" className="ide-btn" disabled={syncing} onClick={syncConfluence}>
        {syncing ? "Syncing…" : "Sync Confluence"}
      </button>
      <div style={{ marginTop: 16 }}>
        {sources.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>No knowledge sources yet.</p>
        ) : (
          sources.map((s) => (
            <div key={s.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <strong>{s.name}</strong> · {s.type} ·{" "}
              <span style={{ color: statusColor(s.status) }}>{s.status}</span>
              {s.lastSyncedAt && (
                <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 8 }}>
                  Last sync: {new Date(s.lastSyncedAt).toLocaleString()}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function RetentionPanel() {
  const [settings, setSettings] = useState({
    investigationRetentionDays: undefined as number | undefined,
    slackConversationRetentionDays: undefined as number | undefined,
    auditLogRetentionDays: undefined as number | undefined,
    knowledgeSourceRefreshDays: undefined as number | undefined,
  });

  useEffect(() => {
    fetchJson<{ settings: typeof settings }>("/api/support/enterprise/retention")
      .then((d) => setSettings(d.settings))
      .catch(() => undefined);
  }, []);

  async function save() {
    await fetchJson("/api/support/enterprise/retention", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "update_settings", settings }),
    });
  }

  function field(label: string, key: keyof typeof settings) {
    return (
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, marginBottom: 12 }}>
        {label}
        <input
          type="number"
          min={0}
          value={settings[key] ?? ""}
          onChange={(e) =>
            setSettings((s) => ({
              ...s,
              [key]: e.target.value ? Number(e.target.value) : undefined,
            }))
          }
        />
      </label>
    );
  }

  return (
    <div data-testid="retention-panel">
      {field("Investigation retention (days)", "investigationRetentionDays")}
      {field("Slack conversation retention (days)", "slackConversationRetentionDays")}
      {field("Audit log retention (days)", "auditLogRetentionDays")}
      {field("Knowledge source refresh (days)", "knowledgeSourceRefreshDays")}
      <button type="button" className="ide-btn" onClick={save}>
        Save retention settings
      </button>
    </div>
  );
}

export function NotificationsPanel() {
  const [notifications, setNotifications] = useState<
    Array<{ id: string; title: string; message: string; level: string; read: boolean; createdAt: string }>
  >([]);

  const load = useCallback(() => {
    fetchJson<{ notifications: typeof notifications }>("/api/support/enterprise/notifications")
      .then((d) => setNotifications(d.notifications))
      .catch(() => setNotifications([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markRead(id: string) {
    await fetchJson("/api/support/enterprise/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "mark_read", id }),
    });
    load();
  }

  return (
    <div data-testid="notifications-panel">
      {notifications.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: 13 }}>No notifications.</p>
      ) : (
        notifications.map((n) => (
          <div key={n.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", opacity: n.read ? 0.6 : 1 }}>
            <strong>{n.title}</strong> · {n.level}
            <p style={{ fontSize: 13, margin: "4px 0" }}>{n.message}</p>
            {!n.read && (
              <button type="button" className="ide-btn" onClick={() => markRead(n.id)}>
                Mark read
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}
