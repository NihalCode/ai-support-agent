import "server-only";

import { randomUUID } from "node:crypto";

import { isPostgresConfigured, pgQuery } from "@/lib/db/postgres";
import {
  defaultOrgId,
  enterpriseDataDir,
  readJsonArrayFile,
  readJsonFile,
  writeJsonArrayFile,
  writeJsonFile,
} from "@/lib/support/enterprise/file-store";
import type {
  AnalyticsEvent,
  ContextUsageMetric,
  DailyMetricsRollup,
  MetricsSettings,
  RollupMetrics,
  TaskBaselines,
} from "../MetricsTypes";
import { DEFAULT_TASK_BASELINES } from "../MetricsTypes";

const MAX_EVENTS = 5000;

function eventsFile(): string {
  return `${enterpriseDataDir("metrics")}/events.json`;
}

function rollupsFile(): string {
  return `${enterpriseDataDir("metrics")}/rollups.json`;
}

function settingsFile(): string {
  return `${enterpriseDataDir("metrics")}/settings.json`;
}

function contextFile(): string {
  return `${enterpriseDataDir("metrics")}/context-usage.json`;
}

function rowToEvent(row: Record<string, unknown>): AnalyticsEvent {
  return {
    id: String(row.id),
    orgId: String(row.org_id ?? "default"),
    eventType: String(row.event_type),
    category: String(row.category) as AnalyticsEvent["category"],
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : undefined,
    actorRole: row.actor_role ? String(row.actor_role) : undefined,
    durationMs: row.duration_ms != null ? Number(row.duration_ms) : undefined,
    success: row.success !== false,
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function rowToRollup(row: Record<string, unknown>): DailyMetricsRollup {
  const metrics = row.metrics;
  return {
    orgId: String(row.org_id ?? "default"),
    date: String(row.date).slice(0, 10),
    metrics:
      metrics && typeof metrics === "object"
        ? (metrics as RollupMetrics)
        : ({} as RollupMetrics),
    computedAt: new Date(String(row.computed_at)).toISOString(),
  };
}

function defaultSettings(): MetricsSettings {
  return {
    orgId: defaultOrgId(),
    enabled: true,
    retentionDays: 90,
    taskBaselines: { ...DEFAULT_TASK_BASELINES },
    allowDeveloperView: true,
    allowSupportAgentView: false,
    updatedAt: new Date().toISOString(),
  };
}

export async function getMetricsSettings(): Promise<MetricsSettings> {
  if (isPostgresConfigured()) {
    const rows = await pgQuery`
      SELECT enabled, retention_days, task_baselines, allow_developer_view,
             allow_support_agent_view, updated_at, updated_by
      FROM metrics_settings
      WHERE org_id = ${defaultOrgId()}
      LIMIT 1
    `;
    if (!rows[0]) return defaultSettings();
    const row = rows[0];
    const baselines = row.task_baselines;
    return {
      orgId: defaultOrgId(),
      enabled: row.enabled !== false,
      retentionDays: Number(row.retention_days ?? 90),
      taskBaselines:
        baselines && typeof baselines === "object"
          ? (baselines as TaskBaselines)
          : { ...DEFAULT_TASK_BASELINES },
      allowDeveloperView: row.allow_developer_view !== false,
      allowSupportAgentView: row.allow_support_agent_view === true,
      updatedAt: new Date(String(row.updated_at)).toISOString(),
      updatedBy: row.updated_by ? String(row.updated_by) : undefined,
    };
  }
  return readJsonFile<MetricsSettings>(settingsFile(), defaultSettings());
}

export async function saveMetricsSettings(
  patch: Partial<Omit<MetricsSettings, "orgId">>,
  updatedBy?: string
): Promise<MetricsSettings> {
  const current = await getMetricsSettings();
  const next: MetricsSettings = {
    ...current,
    ...patch,
    taskBaselines: patch.taskBaselines ?? current.taskBaselines,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy ?? patch.updatedBy ?? current.updatedBy,
  };

  if (isPostgresConfigured()) {
    await pgQuery`
      INSERT INTO metrics_settings (
        org_id, enabled, retention_days, task_baselines,
        allow_developer_view, allow_support_agent_view, updated_at, updated_by
      ) VALUES (
        ${defaultOrgId()}, ${next.enabled}, ${next.retentionDays},
        ${JSON.stringify(next.taskBaselines)}::jsonb,
        ${next.allowDeveloperView}, ${next.allowSupportAgentView},
        ${next.updatedAt}, ${next.updatedBy ?? null}
      )
      ON CONFLICT (org_id) DO UPDATE SET
        enabled = EXCLUDED.enabled,
        retention_days = EXCLUDED.retention_days,
        task_baselines = EXCLUDED.task_baselines,
        allow_developer_view = EXCLUDED.allow_developer_view,
        allow_support_agent_view = EXCLUDED.allow_support_agent_view,
        updated_at = EXCLUDED.updated_at,
        updated_by = EXCLUDED.updated_by
    `;
    return next;
  }

  writeJsonFile(settingsFile(), next);
  return next;
}

export async function insertAnalyticsEvent(event: AnalyticsEvent): Promise<void> {
  if (isPostgresConfigured()) {
    await pgQuery`
      INSERT INTO analytics_events (
        id, org_id, event_type, category, actor_user_id, actor_role,
        duration_ms, success, metadata, created_at
      ) VALUES (
        ${event.id}, ${event.orgId}, ${event.eventType}, ${event.category},
        ${event.actorUserId ?? null}, ${event.actorRole ?? null},
        ${event.durationMs ?? null}, ${event.success},
        ${event.metadata ? JSON.stringify(event.metadata) : null},
        ${event.createdAt}
      )
    `;
    return;
  }

  const all = readJsonArrayFile<AnalyticsEvent>(eventsFile());
  all.unshift(event);
  writeJsonArrayFile(eventsFile(), all.slice(0, MAX_EVENTS));
}

export async function insertContextUsageMetric(metric: ContextUsageMetric): Promise<void> {
  if (isPostgresConfigured()) {
    await pgQuery`
      INSERT INTO context_usage_metrics (
        id, org_id, event_id, investigation_id, chunks_retrieved,
        tokens_estimated, namespaces, created_at
      ) VALUES (
        ${metric.id}, ${metric.orgId}, ${metric.eventId ?? null},
        ${metric.investigationId ?? null}, ${metric.chunksRetrieved},
        ${metric.tokensEstimated ?? null},
        ${metric.namespaces ? JSON.stringify(metric.namespaces) : null}::jsonb,
        ${metric.createdAt}
      )
    `;
    return;
  }

  const all = readJsonArrayFile<ContextUsageMetric>(contextFile());
  all.unshift(metric);
  writeJsonArrayFile(contextFile(), all.slice(0, MAX_EVENTS));
}

export async function listAnalyticsEvents(filters: {
  from?: string;
  to?: string;
  category?: string;
  eventType?: string;
  limit?: number;
}): Promise<AnalyticsEvent[]> {
  const limit = filters.limit ?? 500;
  if (isPostgresConfigured()) {
    const org = defaultOrgId();
    const rows = await pgQuery`
      SELECT * FROM analytics_events
      WHERE org_id = ${org}
      ORDER BY created_at DESC
      LIMIT ${Math.min(limit * 3, 2000)}
    `;
    let items = rows.map(rowToEvent);
    if (filters.from) {
      const fromMs = new Date(filters.from).getTime();
      items = items.filter((e) => new Date(e.createdAt).getTime() >= fromMs);
    }
    if (filters.to) {
      const toMs = new Date(filters.to).getTime();
      items = items.filter((e) => new Date(e.createdAt).getTime() <= toMs);
    }
    if (filters.category) items = items.filter((e) => e.category === filters.category);
    if (filters.eventType) items = items.filter((e) => e.eventType === filters.eventType);
    return items.slice(0, limit);
  }

  let items = readJsonArrayFile<AnalyticsEvent>(eventsFile());
  if (filters.from) {
    const fromMs = new Date(filters.from).getTime();
    items = items.filter((e) => new Date(e.createdAt).getTime() >= fromMs);
  }
  if (filters.to) {
    const toMs = new Date(filters.to).getTime();
    items = items.filter((e) => new Date(e.createdAt).getTime() <= toMs);
  }
  if (filters.category) items = items.filter((e) => e.category === filters.category);
  if (filters.eventType) items = items.filter((e) => e.eventType === filters.eventType);
  return items.slice(0, limit);
}

export async function listContextUsageMetrics(filters: {
  from?: string;
  to?: string;
  limit?: number;
}): Promise<ContextUsageMetric[]> {
  const limit = filters.limit ?? 200;
  if (isPostgresConfigured()) {
    const rows = await pgQuery`
      SELECT * FROM context_usage_metrics
      WHERE org_id = ${defaultOrgId()}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    let items = rows.map((row) => ({
      id: String(row.id),
      orgId: String(row.org_id),
      eventId: row.event_id ? String(row.event_id) : undefined,
      investigationId: row.investigation_id ? String(row.investigation_id) : undefined,
      chunksRetrieved: Number(row.chunks_retrieved ?? 0),
      tokensEstimated: row.tokens_estimated != null ? Number(row.tokens_estimated) : undefined,
      namespaces: Array.isArray(row.namespaces)
        ? (row.namespaces as string[])
        : undefined,
      createdAt: new Date(String(row.created_at)).toISOString(),
    }));
    if (filters.from) {
      const fromMs = new Date(filters.from).getTime();
      items = items.filter((e) => new Date(e.createdAt).getTime() >= fromMs);
    }
    if (filters.to) {
      const toMs = new Date(filters.to).getTime();
      items = items.filter((e) => new Date(e.createdAt).getTime() <= toMs);
    }
    return items;
  }

  let items = readJsonArrayFile<ContextUsageMetric>(contextFile());
  if (filters.from) {
    const fromMs = new Date(filters.from).getTime();
    items = items.filter((e) => new Date(e.createdAt).getTime() >= fromMs);
  }
  if (filters.to) {
    const toMs = new Date(filters.to).getTime();
    items = items.filter((e) => new Date(e.createdAt).getTime() <= toMs);
  }
  return items.slice(0, limit);
}

export async function upsertDailyRollup(rollup: DailyMetricsRollup): Promise<void> {
  if (isPostgresConfigured()) {
    await pgQuery`
      INSERT INTO daily_metrics_rollups (org_id, date, metrics, computed_at)
      VALUES (
        ${rollup.orgId}, ${rollup.date},
        ${JSON.stringify(rollup.metrics)}::jsonb, ${rollup.computedAt}
      )
      ON CONFLICT (org_id, date) DO UPDATE SET
        metrics = EXCLUDED.metrics,
        computed_at = EXCLUDED.computed_at
    `;
    return;
  }

  const all = readJsonArrayFile<DailyMetricsRollup>(rollupsFile());
  const idx = all.findIndex((r) => r.date === rollup.date);
  if (idx >= 0) all[idx] = rollup;
  else all.push(rollup);
  all.sort((a, b) => b.date.localeCompare(a.date));
  writeJsonArrayFile(rollupsFile(), all.slice(0, 400));
}

export async function listDailyRollups(filters: {
  from?: string;
  to?: string;
}): Promise<DailyMetricsRollup[]> {
  if (isPostgresConfigured()) {
    const rows = await pgQuery`
      SELECT * FROM daily_metrics_rollups
      WHERE org_id = ${defaultOrgId()}
      ORDER BY date DESC
    `;
    let items = rows.map(rowToRollup);
    if (filters.from) items = items.filter((r) => r.date >= filters.from!.slice(0, 10));
    if (filters.to) items = items.filter((r) => r.date <= filters.to!.slice(0, 10));
    return items.sort((a, b) => a.date.localeCompare(b.date));
  }

  let items = readJsonArrayFile<DailyMetricsRollup>(rollupsFile());
  if (filters.from) items = items.filter((r) => r.date >= filters.from!.slice(0, 10));
  if (filters.to) items = items.filter((r) => r.date <= filters.to!.slice(0, 10));
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

export async function purgeExpiredEvents(retentionDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
  if (isPostgresConfigured()) {
    const rows = await pgQuery`
      DELETE FROM analytics_events
      WHERE org_id = ${defaultOrgId()} AND created_at < ${cutoff}
      RETURNING id
    `;
    await pgQuery`
      DELETE FROM context_usage_metrics
      WHERE org_id = ${defaultOrgId()} AND created_at < ${cutoff}
    `;
    return rows.length;
  }

  const all = readJsonArrayFile<AnalyticsEvent>(eventsFile());
  const kept = all.filter((e) => e.createdAt >= cutoff);
  writeJsonArrayFile(eventsFile(), kept);
  return all.length - kept.length;
}

export function metricsBackend(): "postgres" | "file" {
  return isPostgresConfigured() ? "postgres" : "file";
}

export { randomUUID as newMetricsId };
