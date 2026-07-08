import "server-only";

import type { AnalyticsEvent, DailyMetricsRollup, RollupMetrics } from "./MetricsTypes";
import {
  computeRollupTimeSaved,
  emptyRollupMetrics,
} from "./TimeSavedEstimator";
import {
  getMetricsSettings,
  listAnalyticsEvents,
  listDailyRollups,
  purgeExpiredEvents,
  upsertDailyRollup,
} from "./stores/metrics-store";

function dateKey(iso: string): string {
  return iso.slice(0, 10);
}

function computeRollupFromEvents(
  events: AnalyticsEvent[],
  baselines: Record<string, number | undefined>
): RollupMetrics {
  const rollup = emptyRollupMetrics();
  if (events.length === 0) return rollup;

  rollup.eventCount = events.length;
  let durationTotal = 0;
  let durationCount = 0;

  for (const event of events) {
    if (event.success) rollup.successCount += 1;
    else rollup.failureCount += 1;

    rollup.byCategory[event.category] = (rollup.byCategory[event.category] ?? 0) + 1;
    rollup.byEventType[event.eventType] = (rollup.byEventType[event.eventType] ?? 0) + 1;

    if (typeof event.durationMs === "number") {
      durationTotal += event.durationMs;
      durationCount += 1;
    }

    switch (event.eventType) {
      case "investigation.created":
        rollup.investigationsCreated += 1;
        break;
      case "investigation.resolved":
        rollup.investigationsResolved += 1;
        break;
      case "chat.response":
      case "chat.stream":
        rollup.chatResponses += 1;
        break;
      case "rag.retrieve":
        rollup.ragRetrievals += 1;
        break;
      case "approval.created":
        rollup.approvalsCreated += 1;
        break;
      case "approval.approved":
        rollup.approvalsApproved += 1;
        break;
      case "integration.jira.action":
      case "integration.zendesk.action":
      case "integration.slack.reply":
        rollup.integrationActions += 1;
        break;
      case "knowledge.sync":
        rollup.knowledgeSyncs += 1;
        break;
      default:
        break;
    }
  }

  rollup.totalDurationMs = durationTotal;
  rollup.avgDurationMs = durationCount > 0 ? Math.round(durationTotal / durationCount) : 0;
  rollup.estimatedTimeSavedMinutes = computeRollupTimeSaved(events, baselines);
  return rollup;
}

export async function computeDailyRollupForDate(date: string): Promise<DailyMetricsRollup> {
  const settings = await getMetricsSettings();
  const from = `${date}T00:00:00.000Z`;
  const to = `${date}T23:59:59.999Z`;
  const events = await listAnalyticsEvents({ from, to, limit: 10000 });

  return {
    orgId: settings.orgId,
    date,
    metrics: computeRollupFromEvents(events, settings.taskBaselines),
    computedAt: new Date().toISOString(),
  };
}

export async function recomputeRollups(options?: {
  from?: string;
  to?: string;
}): Promise<{ dates: string[]; purged: number }> {
  const settings = await getMetricsSettings();
  const end = options?.to ? new Date(options.to) : new Date();
  const start = options?.from
    ? new Date(options.from)
    : new Date(end.getTime() - 30 * 86400000);

  const dates: string[] = [];
  const cursor = new Date(start);
  cursor.setUTCHours(0, 0, 0, 0);

  while (cursor <= end) {
    const d = dateKey(cursor.toISOString());
    dates.push(d);
    const rollup = await computeDailyRollupForDate(d);
    await upsertDailyRollup(rollup);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const purged = await purgeExpiredEvents(settings.retentionDays);
  return { dates, purged };
}

export async function getRollupsInRange(from: string, to: string): Promise<DailyMetricsRollup[]> {
  return listDailyRollups({ from, to });
}

export { computeRollupFromEvents };
