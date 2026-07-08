"use client";

import { useCallback, useEffect, useState } from "react";

import { AuditTimelinePanel } from "@/components/enterprise/AuditTimelinePanel";
import { AppSelect } from "@/components/ui/AppSelect";
import type {
  IntegrationHealthCard,
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
    <div data-testid="integration-health-panel" style={{ minWidth: 0, maxWidth: "100%" }}>
      <p style={{ color: "var(--muted)", fontSize: 13 }}>{summary}</p>
      {!developerMode && degraded.length > 0 && (
        <ul style={{ fontSize: 13, paddingLeft: 18 }}>
          {degraded.map((d, i) => (
            <li key={i}>{d.friendly}</li>
          ))}
        </ul>
      )}
      <div style={{ display: "grid", gap: 12, marginTop: 16, minWidth: 0, maxWidth: "100%" }}>
        {cards.map((card) => (
          <div
            key={card.integration}
            data-testid={`health-card-${card.integration.toLowerCase().replace(/\s+/g, "-")}`}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 12,
              minWidth: 0,
              maxWidth: "100%",
              overflow: "hidden",
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
  return <AuditTimelinePanel />;
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
  const [sources, setSources] = useState<KnowledgeSourceView[]>([]);
  const [recentRuns, setRecentRuns] = useState<KnowledgeSyncRunView[]>([]);
  const [diagnostics, setDiagnostics] = useState<KnowledgeDiagnosticsView | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncingSourceId, setSyncingSourceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([
      fetchJson<{ sources: KnowledgeSourceView[]; recentRuns: KnowledgeSyncRunView[] }>(
        "/api/admin/knowledge/sources"
      ),
      fetchJson<{ diagnostics: KnowledgeDiagnosticsView }>("/api/admin/knowledge/diagnostics"),
    ])
      .then(([sourcesData, diagData]) => {
        setSources(sourcesData.sources);
        setRecentRuns(sourcesData.recentRuns);
        setDiagnostics(diagData.diagnostics);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load knowledge sources");
        setSources([]);
        setRecentRuns([]);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function syncAll(force = false) {
    setSyncing(true);
    setError(null);
    try {
      await fetchJson("/api/admin/knowledge/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function syncSource(sourceId: string) {
    setSyncingSourceId(sourceId);
    setError(null);
    try {
      await fetchJson("/api/admin/knowledge/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceIds: [sourceId] }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncingSourceId(null);
    }
  }

  return (
    <div data-testid="knowledge-sources-panel">
      {diagnostics && (
        <div
          data-testid="knowledge-diagnostics-summary"
          style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}
        >
          {diagnostics.enabledSourceCount}/{diagnostics.sourceCount} sources enabled ·{" "}
          {diagnostics.indexedChunkCount} chunks indexed · vector DB{" "}
          {diagnostics.vectorDbConfigured ? "configured" : "not configured"} · embeddings{" "}
          {diagnostics.embeddingConfigured ? "configured" : "not configured"}
          {diagnostics.lastSyncAt && (
            <>
              {" "}
              · last sync {new Date(diagnostics.lastSyncAt).toLocaleString()}
              {diagnostics.lastSyncStatus ? ` (${diagnostics.lastSyncStatus})` : ""}
            </>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <button
          type="button"
          className="ide-btn"
          data-testid="knowledge-sync-all"
          disabled={syncing || syncingSourceId !== null}
          onClick={() => syncAll(false)}
        >
          {syncing ? "Syncing…" : "Sync all"}
        </button>
        <button
          type="button"
          className="ide-btn"
          data-testid="knowledge-sync-all-force"
          disabled={syncing || syncingSourceId !== null}
          onClick={() => syncAll(true)}
        >
          Force re-sync all
        </button>
      </div>

      {error && (
        <p data-testid="knowledge-sync-error" style={{ color: "#ef4444", fontSize: 13 }}>
          {error}
        </p>
      )}

      <div data-testid="knowledge-sources-list">
        {sources.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>No knowledge sources configured.</p>
        ) : (
          sources.map((s) => (
            <div
              key={s.id}
              data-testid={`knowledge-source-${s.id}`}
              style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <strong>{s.name}</strong> · {s.product} · {s.type}
                  {!s.enabled && (
                    <span style={{ marginLeft: 8, fontSize: 12, color: "var(--muted)" }}>(disabled)</span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: statusColor(s.status), fontSize: 12 }}>{s.status}</span>
                  <button
                    type="button"
                    className="ide-btn"
                    data-testid={`knowledge-sync-${s.id}`}
                    disabled={!s.enabled || syncing || syncingSourceId !== null}
                    onClick={() => syncSource(s.id)}
                  >
                    {syncingSourceId === s.id ? "Syncing…" : "Sync"}
                  </button>
                </div>
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--muted)" }}>
                {s.chunkCount} chunks
                {s.documentState?.lastIndexedAt &&
                  ` · indexed ${new Date(s.documentState.lastIndexedAt).toLocaleString()}`}
                {s.url && ` · ${s.url}`}
              </p>
              {s.error && (
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#ef4444" }}>{s.error}</p>
              )}
            </div>
          ))
        )}
      </div>

      <div data-testid="knowledge-sync-history" style={{ marginTop: 20 }}>
        <strong style={{ fontSize: 13 }}>Recent sync runs</strong>
        {recentRuns.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 8 }}>No sync history yet.</p>
        ) : (
          recentRuns.map((run) => (
            <div
              key={run.id}
              data-testid={`knowledge-run-${run.id}`}
              style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}
            >
              <span style={{ color: statusColor(run.status) }}>{run.status}</span>
              {" · "}
              {run.triggeredBy} · {new Date(run.startedAt).toLocaleString()}
              {" · "}
              {run.chunkCount} chunks, {run.skippedUnchangedCount} skipped, {run.failedCount} failed
              {run.errorSummary && (
                <p style={{ margin: "4px 0 0", color: "#ef4444", fontSize: 12 }}>{run.errorSummary}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

interface KnowledgeDiagnosticsView {
  vectorDbConfigured: boolean;
  embeddingConfigured: boolean;
  sourceCount: number;
  enabledSourceCount: number;
  lastSyncStatus: string | null;
  lastSyncAt: string | null;
  indexedDocumentCount: number;
  indexedChunkCount: number;
  staleDocumentCount: number;
  failedSourceCount: number;
}

interface KnowledgeSourceView {
  id: string;
  name: string;
  product: string;
  type: string;
  url?: string;
  enabled: boolean;
  chunkCount: number;
  status: string;
  error?: string;
  documentState?: { lastIndexedAt?: string };
}

interface KnowledgeSyncRunView {
  id: string;
  status: string;
  triggeredBy: string;
  startedAt: string;
  chunkCount: number;
  skippedUnchangedCount: number;
  failedCount: number;
  errorSummary?: string;
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

type MetricsRange = "today" | "7d" | "30d" | "qtd";

function MetricsRangeSelect({
  value,
  onChange,
}: {
  value: MetricsRange;
  onChange: (v: MetricsRange) => void;
}) {
  return (
    <AppSelect
      testId="metrics-range-select"
      value={value}
      onChange={onChange}
      aria-label="Metrics time range"
      options={[
        { value: "today", label: "Today" },
        { value: "7d", label: "Last 7 days" },
        { value: "30d", label: "Last 30 days" },
        { value: "qtd", label: "Quarter to date" },
      ]}
    />
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 12,
        minHeight: 72,
      }}
    >
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{value}</div>
      {hint ? <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{hint}</div> : null}
    </div>
  );
}

function SimpleBarChart({ points }: { points: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {points.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: 13 }}>No data for this range.</p>
      ) : (
        points.map((p) => (
          <div key={p.label}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
              <span>{p.label}</span>
              <span>{p.value}</span>
            </div>
            <div style={{ background: "var(--border)", borderRadius: 4, height: 8 }}>
              <div
                style={{
                  width: `${Math.round((p.value / max) * 100)}%`,
                  background: "#6366f1",
                  height: 8,
                  borderRadius: 4,
                }}
              />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export function MetricsDashboardPanel({ canExport }: { canExport: boolean }) {
  const [range, setRange] = useState<MetricsRange>("7d");
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [timeseries, setTimeseries] = useState<Array<{ date: string; metrics: { eventCount: number } }>>([]);
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);
  const [context, setContext] = useState<Record<string, unknown> | null>(null);
  const [tickets, setTickets] = useState<Record<string, unknown> | null>(null);
  const [integrations, setIntegrations] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const q = `?range=${range}`;
    setError(null);
    Promise.all([
      fetchJson<Record<string, unknown>>(`/api/metrics/summary${q}`),
      fetchJson<{ points: typeof timeseries }>(`/api/metrics/timeseries${q}`),
      fetchJson<{ events: typeof events }>(`/api/metrics/events${q}&limit=50`),
      fetchJson<Record<string, unknown>>(`/api/metrics/context${q}`),
      fetchJson<Record<string, unknown>>(`/api/metrics/tickets${q}`),
      fetchJson<Record<string, unknown>>(`/api/metrics/integrations${q}`),
    ])
      .then(([s, ts, ev, ctx, tk, integ]) => {
        setSummary(s);
        setTimeseries(ts.points ?? []);
        setEvents(ev.events ?? []);
        setContext(ctx);
        setTickets(tk);
        setIntegrations(integ);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load metrics"));
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const s = (summary?.summary ?? {}) as Record<string, unknown>;
  const byCategory = (summary?.byCategory ?? {}) as Record<string, number>;

  return (
    <div data-testid="metrics-dashboard-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <MetricsRangeSelect value={range} onChange={setRange} />
        {canExport && (
          <a
            href={`/api/metrics/export.csv?range=${range}`}
            className="ide-btn"
            data-testid="metrics-export-csv"
            style={{ textDecoration: "none", fontSize: 13 }}
          >
            Export CSV
          </a>
        )}
      </div>

      {error && <p style={{ color: "#ef4444" }}>{error}</p>}

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Executive summary</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
          <SummaryCard label="Total events" value={String(s.totalEvents ?? 0)} />
          <SummaryCard
            label="Success rate"
            value={s.successRate != null ? `${s.successRate}%` : "unavailable"}
          />
          <SummaryCard label="Investigations" value={String(s.investigationsCreated ?? 0)} />
          <SummaryCard label="Chat responses" value={String(s.chatResponses ?? 0)} />
          <SummaryCard
            label="Time saved"
            value={
              typeof s.timeSavedDisplay === "string" &&
              !s.timeSavedDisplay.includes("unavailable")
                ? s.timeSavedDisplay
                : "unavailable"
            }
            hint={
              typeof s.timeSavedDisplay === "string" && s.timeSavedDisplay.includes("unavailable")
                ? "Configure baselines in Metrics Settings"
                : undefined
            }
          />
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Activity over time</h3>
        <SimpleBarChart
          points={timeseries.map((p) => ({ label: p.date, value: p.metrics?.eventCount ?? 0 }))}
        />
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>Context metrics</h3>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            Retrievals: {String(context?.totalRetrievals ?? 0)} · Avg chunks:{" "}
            {String(context?.avgChunksPerRetrieval ?? 0)}
          </p>
        </div>
        <div>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>Ticket metrics</h3>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            Actions: {String(tickets?.totalActions ?? 0)} · Linked: {String(tickets?.linked ?? 0)}
          </p>
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Workflow funnel</h3>
        <SimpleBarChart
          points={[
            { label: "Investigations created", value: Number(s.investigationsCreated ?? 0) },
            { label: "Investigations resolved", value: Number(s.investigationsResolved ?? 0) },
            {
              label: "Approvals created",
              value: Number((s.approvalFunnel as Record<string, number> | undefined)?.created ?? 0),
            },
            {
              label: "Approvals approved",
              value: Number((s.approvalFunnel as Record<string, number> | undefined)?.approved ?? 0),
            },
          ]}
        />
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>By category</h3>
        <SimpleBarChart
          points={Object.entries(byCategory).map(([label, value]) => ({ label, value }))}
        />
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Integration health impact</h3>
        <SimpleBarChart
          points={Object.entries(
            (integrations?.integrations as Record<string, { total: number }>) ?? {}
          ).map(([label, v]) => ({ label, value: v.total }))}
        />
      </section>

      <section>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Recent activity</h3>
        {events.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>No events recorded yet.</p>
        ) : (
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                <th style={{ padding: "6px 4px" }}>Time</th>
                <th>Type</th>
                <th>Category</th>
                <th>OK</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={String(e.id)} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "6px 4px" }}>{String(e.createdAt ?? "").slice(0, 19)}</td>
                  <td>{String(e.eventType)}</td>
                  <td>{String(e.category)}</td>
                  <td>{e.success ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

export function MetricsSettingsPanel() {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchJson<{ settings: Record<string, unknown> }>("/api/metrics/settings")
      .then((d) => setSettings(d.settings))
      .catch(() => setSettings(null));
  }, []);

  async function save() {
    if (!settings) return;
    await fetchJson("/api/metrics/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!settings) return <p style={{ color: "var(--muted)" }}>Loading metrics settings…</p>;

  const baselines = (settings.taskBaselines ?? {}) as Record<string, number>;

  return (
    <div data-testid="metrics-settings-panel">
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={Boolean(settings.enabled)}
          onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
        />
        Enable metrics collection
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, marginBottom: 12 }}>
        Retention (days)
        <input
          type="number"
          min={7}
          value={Number(settings.retentionDays ?? 90)}
          onChange={(e) => setSettings({ ...settings, retentionDays: Number(e.target.value) })}
        />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={Boolean(settings.allowDeveloperView)}
          onChange={(e) => setSettings({ ...settings, allowDeveloperView: e.target.checked })}
        />
        Allow developer role to view metrics
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 16 }}>
        <input
          type="checkbox"
          checked={Boolean(settings.allowSupportAgentView)}
          onChange={(e) => setSettings({ ...settings, allowSupportAgentView: e.target.checked })}
        />
        Allow support agent role to view metrics
      </label>
      <h4 style={{ fontSize: 13, marginBottom: 8 }}>Task baselines (minutes)</h4>
      {Object.entries(baselines).map(([key, val]) => (
        <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, marginBottom: 8 }}>
          {key.replace(/_/g, " ")}
          <input
            type="number"
            min={0}
            value={val}
            onChange={(e) =>
              setSettings({
                ...settings,
                taskBaselines: { ...baselines, [key]: Number(e.target.value) },
              })
            }
          />
        </label>
      ))}
      <button type="button" className="ide-btn" onClick={() => void save()}>
        Save metrics settings
      </button>
      {saved && <span style={{ marginLeft: 8, fontSize: 12, color: "#22c55e" }}>Saved</span>}
    </div>
  );
}
