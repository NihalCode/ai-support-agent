import "server-only";

import { defaultOrgId } from "@/lib/support/enterprise/file-store";
import type { TrackEventInput } from "./MetricsTypes";
import { sanitizeMetricsMetadata } from "./MetricsPrivacy";
import {
  getMetricsSettings,
  insertAnalyticsEvent,
  insertContextUsageMetric,
  newMetricsId,
} from "./stores/metrics-store";

export interface MetricsTimerEndInput {
  success?: boolean;
  metadata?: Record<string, unknown>;
  contextUsage?: TrackEventInput["contextUsage"];
}

export interface MetricsTimer {
  end: (extra?: MetricsTimerEndInput) => void;
}

class MetricsService {
  async track(input: TrackEventInput): Promise<void> {
    try {
      const settings = await getMetricsSettings();
      if (!settings.enabled) return;

      const eventId = newMetricsId();
      const metadata = sanitizeMetricsMetadata(input.metadata);

      await insertAnalyticsEvent({
        id: eventId,
        orgId: defaultOrgId(),
        eventType: input.eventType,
        category: input.category,
        actorUserId: input.actorUserId,
        actorRole: input.actorRole,
        durationMs: input.durationMs,
        success: input.success !== false,
        metadata,
        createdAt: new Date().toISOString(),
      });

      if (input.contextUsage) {
        await insertContextUsageMetric({
          id: newMetricsId(),
          orgId: defaultOrgId(),
          eventId,
          investigationId: input.contextUsage.investigationId,
          chunksRetrieved: input.contextUsage.chunksRetrieved ?? 0,
          tokensEstimated: input.contextUsage.tokensEstimated,
          namespaces: input.contextUsage.namespaces,
          createdAt: new Date().toISOString(),
        });
      }
    } catch {
      // Best-effort — never break caller workflows
    }
  }

  startTimer(
    eventType: TrackEventInput["eventType"],
    category: TrackEventInput["category"],
    base?: Omit<TrackEventInput, "eventType" | "category" | "durationMs">
  ): MetricsTimer {
    const started = Date.now();
    return {
      end: (extra) => {
        void this.track({
          eventType,
          category,
          ...base,
          ...extra,
          durationMs: Date.now() - started,
        });
      },
    };
  }
}

export const metrics = new MetricsService();
