import "server-only";

import type {
  AnalyticsEvent,
  ContextUsageMetric,
  MetricsDateRange,
  MetricsQueryFilters,
  RollupMetrics,
} from "./MetricsTypes";
import {
  estimateTotalTimeSavedMinutes,
  formatTimeSavedDisplay,
  hasConfiguredBaselines,
} from "./TimeSavedEstimator";
import { computeRollupFromEvents, getRollupsInRange } from "./MetricsAggregator";
import {
  getMetricsSettings,
  listAnalyticsEvents,
  listContextUsageMetrics,
} from "./stores/metrics-store";

export function resolveDateRange(filters: MetricsQueryFilters): { from: string; to: string } {
  const now = new Date();
  const to = filters.to ?? now.toISOString();

  if (filters.from) {
    return { from: filters.from, to };
  }

  const range = filters.range ?? "7d";
  const start = new Date(now);

  switch (range) {
    case "today":
      start.setUTCHours(0, 0, 0, 0);
      break;
    case "7d":
      start.setUTCDate(start.getUTCDate() - 7);
      break;
    case "30d":
      start.setUTCDate(start.getUTCDate() - 30);
      break;
    case "qtd": {
      const month = Math.floor(start.getUTCMonth() / 3) * 3;
      start.setUTCMonth(month, 1);
      start.setUTCHours(0, 0, 0, 0);
      break;
    }
    default:
      start.setUTCDate(start.getUTCDate() - 7);
  }

  return { from: start.toISOString(), to };
}

export async function getMetricsSummary(filters: MetricsQueryFilters) {
  const { from, to } = resolveDateRange(filters);
  const settings = await getMetricsSettings();
  const events = await listAnalyticsEvents({ from, to, limit: 10000 });
  const rollups = await getRollupsInRange(from.slice(0, 10), to.slice(0, 10));

  const rollupMetrics =
    rollups.length > 0
      ? rollups.reduce(
          (acc, r) => mergeRollups(acc, r.metrics),
          emptySummaryRollup()
        )
      : computeRollupFromEvents(events, settings.taskBaselines);

  const timeSaved = estimateTotalTimeSavedMinutes(events, settings);
  const baselinesConfigured = hasConfiguredBaselines(settings.taskBaselines);

  return {
    range: { from, to },
    settings: {
      enabled: settings.enabled,
      baselinesConfigured,
    },
    summary: {
      totalEvents: rollupMetrics.eventCount,
      successRate:
        rollupMetrics.eventCount > 0
          ? Math.round((rollupMetrics.successCount / rollupMetrics.eventCount) * 1000) / 10
          : null,
      investigationsCreated: rollupMetrics.investigationsCreated,
      investigationsResolved: rollupMetrics.investigationsResolved,
      chatResponses: rollupMetrics.chatResponses,
      ragRetrievals: rollupMetrics.ragRetrievals,
      integrationActions: rollupMetrics.integrationActions,
      avgDurationMs: rollupMetrics.avgDurationMs,
      timeSavedMinutes: timeSaved,
      timeSavedDisplay: formatTimeSavedDisplay(timeSaved),
      approvalFunnel: {
        created: rollupMetrics.approvalsCreated,
        approved: rollupMetrics.approvalsApproved,
      },
    },
    byCategory: rollupMetrics.byCategory,
  };
}

function emptySummaryRollup(): RollupMetrics {
  return computeRollupFromEvents([], {});
}

function mergeRollups(a: RollupMetrics, b: RollupMetrics): RollupMetrics {
  const merged = { ...a };
  merged.eventCount += b.eventCount;
  merged.successCount += b.successCount;
  merged.failureCount += b.failureCount;
  merged.totalDurationMs += b.totalDurationMs;
  merged.investigationsCreated += b.investigationsCreated;
  merged.investigationsResolved += b.investigationsResolved;
  merged.chatResponses += b.chatResponses;
  merged.ragRetrievals += b.ragRetrievals;
  merged.approvalsCreated += b.approvalsCreated;
  merged.approvalsApproved += b.approvalsApproved;
  merged.integrationActions += b.integrationActions;
  merged.knowledgeSyncs += b.knowledgeSyncs;

  for (const [k, v] of Object.entries(b.byCategory)) {
    merged.byCategory[k] = (merged.byCategory[k] ?? 0) + v;
  }
  for (const [k, v] of Object.entries(b.byEventType)) {
    merged.byEventType[k] = (merged.byEventType[k] ?? 0) + v;
  }

  const count = merged.eventCount;
  merged.avgDurationMs = count > 0 ? Math.round(merged.totalDurationMs / count) : 0;

  if (a.estimatedTimeSavedMinutes != null && b.estimatedTimeSavedMinutes != null) {
    merged.estimatedTimeSavedMinutes = a.estimatedTimeSavedMinutes + b.estimatedTimeSavedMinutes;
  } else {
    merged.estimatedTimeSavedMinutes = a.estimatedTimeSavedMinutes ?? b.estimatedTimeSavedMinutes;
  }

  return merged;
}

export async function getMetricsTimeseries(filters: MetricsQueryFilters) {
  const { from, to } = resolveDateRange(filters);
  const rollups = await getRollupsInRange(from.slice(0, 10), to.slice(0, 10));

  if (rollups.length === 0) {
    const settings = await getMetricsSettings();
    const events = await listAnalyticsEvents({ from, to, limit: 10000 });
    const byDate = new Map<string, AnalyticsEvent[]>();
    for (const e of events) {
      const d = e.createdAt.slice(0, 10);
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d)!.push(e);
    }
    const points = [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dayEvents]) => ({
        date,
        metrics: computeRollupFromEvents(dayEvents, settings.taskBaselines),
      }));
    return { from, to, points };
  }

  return {
    from,
    to,
    points: rollups.map((r) => ({ date: r.date, metrics: r.metrics })),
  };
}

export async function getMetricsEvents(filters: MetricsQueryFilters) {
  const { from, to } = resolveDateRange(filters);
  const events = await listAnalyticsEvents({
    from,
    to,
    category: filters.category,
    eventType: filters.eventType,
    limit: filters.limit ?? 100,
  });
  return { from, to, events };
}

export async function getContextMetrics(filters: MetricsQueryFilters) {
  const { from, to } = resolveDateRange(filters);
  const usage = await listContextUsageMetrics({ from, to, limit: 500 });
  const totalChunks = usage.reduce((s, u) => s + u.chunksRetrieved, 0);
  const avgChunks = usage.length > 0 ? Math.round(totalChunks / usage.length) : 0;
  const totalTokens = usage.reduce((s, u) => s + (u.tokensEstimated ?? 0), 0);

  return {
    from,
    to,
    totalRetrievals: usage.length,
    totalChunks,
    avgChunksPerRetrieval: avgChunks,
    totalTokensEstimated: totalTokens || null,
    recent: usage.slice(0, 20),
  };
}

export async function getTicketMetrics(filters: MetricsQueryFilters) {
  const { from, to } = resolveDateRange(filters);
  const events = await listAnalyticsEvents({ from, to, limit: 5000 });
  const ticketEvents = events.filter(
    (e) =>
      e.eventType.startsWith("integration.zendesk") ||
      e.eventType.startsWith("integration.jira") ||
      e.metadata?.ticketId ||
      e.metadata?.issueKey
  );

  const linked = ticketEvents.filter((e) => e.metadata?.action === "link").length;
  const drafts = ticketEvents.filter((e) =>
    String(e.metadata?.action ?? "").includes("draft")
  ).length;
  const writes = ticketEvents.filter((e) =>
    String(e.metadata?.action ?? "").startsWith("request_")
  ).length;

  return {
    from,
    to,
    totalActions: ticketEvents.length,
    linked,
    drafts,
    writeRequests: writes,
    bySystem: {
      jira: ticketEvents.filter((e) => e.eventType.includes("jira")).length,
      zendesk: ticketEvents.filter((e) => e.eventType.includes("zendesk")).length,
    },
  };
}

export async function getIntegrationMetrics(filters: MetricsQueryFilters) {
  const { from, to } = resolveDateRange(filters);
  const events = await listAnalyticsEvents({
    from,
    to,
    category: "integration",
    limit: 2000,
  });

  const byIntegration: Record<string, { total: number; success: number; failed: number }> = {};
  for (const e of events) {
    const key = String(e.metadata?.integration ?? e.eventType.split(".")[1] ?? "unknown");
    if (!byIntegration[key]) byIntegration[key] = { total: 0, success: 0, failed: 0 };
    byIntegration[key].total += 1;
    if (e.success) byIntegration[key].success += 1;
    else byIntegration[key].failed += 1;
  }

  return { from, to, integrations: byIntegration, events: events.slice(0, 50) };
}

export async function exportMetricsCsv(filters: MetricsQueryFilters): Promise<string> {
  const { events } = await getMetricsEvents({ ...filters, limit: 5000 });
  const header = "id,created_at,event_type,category,success,duration_ms,actor_role";
  const rows = events.map((e) =>
    [
      e.id,
      e.createdAt,
      e.eventType,
      e.category,
      e.success,
      e.durationMs ?? "",
      e.actorRole ?? "",
    ].join(",")
  );
  return [header, ...rows].join("\n");
}
