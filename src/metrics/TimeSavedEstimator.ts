import type {
  AnalyticsEvent,
  MetricsSettings,
  RollupMetrics,
  TaskBaselines,
} from "./MetricsTypes";
import { EVENT_TYPE_TO_BASELINE_KEY } from "./MetricsTypes";

export function hasConfiguredBaselines(baselines: TaskBaselines): boolean {
  return Object.values(baselines).some((v) => typeof v === "number" && v > 0);
}

/** Estimate minutes saved for a single event using configured task baselines. */
export function estimateEventTimeSavedMinutes(
  event: AnalyticsEvent,
  baselines: TaskBaselines
): number | null {
  if (!event.success) return null;
  const key = EVENT_TYPE_TO_BASELINE_KEY[event.eventType];
  if (!key) return null;
  const baseline = baselines[key];
  if (typeof baseline !== "number" || baseline <= 0) return null;

  const actualMinutes = (event.durationMs ?? 0) / 60000;
  const saved = baseline - actualMinutes;
  return saved > 0 ? saved : 0;
}

/** Sum estimated time saved across events; null when no baselines configured. */
export function estimateTotalTimeSavedMinutes(
  events: AnalyticsEvent[],
  settings: MetricsSettings
): number | null {
  if (!hasConfiguredBaselines(settings.taskBaselines)) return null;

  let total = 0;
  let counted = 0;
  for (const event of events) {
    const saved = estimateEventTimeSavedMinutes(event, settings.taskBaselines);
    if (saved != null) {
      total += saved;
      counted += 1;
    }
  }
  return counted > 0 ? Math.round(total * 10) / 10 : 0;
}

export function formatTimeSavedDisplay(minutes: number | null): string {
  if (minutes == null) {
    return "Time saved estimate unavailable. Configure task baselines in Metrics Settings.";
  }
  if (minutes <= 0) return "0 min saved (within baseline)";
  if (minutes < 60) return `${minutes.toFixed(1)} min saved`;
  const hours = minutes / 60;
  return `${hours.toFixed(1)} hr saved`;
}

export function computeRollupTimeSaved(
  events: AnalyticsEvent[],
  baselines: TaskBaselines
): number | null {
  const settings = { taskBaselines: baselines } as MetricsSettings;
  return estimateTotalTimeSavedMinutes(events, settings);
}

export function emptyRollupMetrics(): RollupMetrics {
  return {
    eventCount: 0,
    successCount: 0,
    failureCount: 0,
    byCategory: {},
    byEventType: {},
    totalDurationMs: 0,
    avgDurationMs: 0,
    investigationsCreated: 0,
    investigationsResolved: 0,
    chatResponses: 0,
    ragRetrievals: 0,
    approvalsCreated: 0,
    approvalsApproved: 0,
    integrationActions: 0,
    knowledgeSyncs: 0,
    estimatedTimeSavedMinutes: null,
  };
}
