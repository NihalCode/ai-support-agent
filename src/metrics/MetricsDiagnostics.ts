import "server-only";

import { getMetricsSettings, listAnalyticsEvents, metricsBackend } from "./stores/metrics-store";
import { getRollupsInRange } from "./MetricsAggregator";

export async function runMetricsDiagnostics() {
  const settings = await getMetricsSettings();
  const backend = metricsBackend();
  const now = new Date();
  const from = new Date(now.getTime() - 7 * 86400000).toISOString();
  const events = await listAnalyticsEvents({ from, limit: 100 });
  const rollups = await getRollupsInRange(from.slice(0, 10), now.toISOString().slice(0, 10));

  const eventTypes = new Set(events.map((e) => e.eventType));
  const categories = new Set(events.map((e) => e.category));

  return {
    ok: true,
    backend,
    collectionEnabled: settings.enabled,
    retentionDays: settings.retentionDays,
    baselinesConfigured: Object.keys(settings.taskBaselines).length > 0,
    recentEventCount: events.length,
    rollupDays: rollups.length,
    distinctEventTypes: [...eventTypes],
    distinctCategories: [...categories],
    allowDeveloperView: settings.allowDeveloperView,
    allowSupportAgentView: settings.allowSupportAgentView,
    checkedAt: now.toISOString(),
  };
}
