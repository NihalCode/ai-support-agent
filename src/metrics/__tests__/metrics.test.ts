import { describe, expect, it } from "vitest";

import { sanitizeMetricsMetadata, sanitizeExportCell } from "@/metrics/MetricsPrivacy";
import { metrics } from "@/metrics/MetricsService";
import {
  estimateTotalTimeSavedMinutes,
  formatTimeSavedDisplay,
  hasConfiguredBaselines,
} from "@/metrics/TimeSavedEstimator";
import { computeRollupFromEvents } from "@/metrics/MetricsAggregator";
import { canAccessMetrics, canManageMetricsSettings } from "@/metrics/metrics-auth";
import type { AnalyticsEvent, MetricsSettings } from "@/metrics/MetricsTypes";
import { DEFAULT_TASK_BASELINES } from "@/metrics/MetricsTypes";

describe("MetricsPrivacy", () => {
  it("strips sensitive metadata keys", () => {
    const out = sanitizeMetricsMetadata({
      sessionId: "abc",
      apiKey: "secret-key",
      token: "tok",
      password: "pw",
      authorization: "Bearer xyz",
      rawMessage: "full ticket body",
    });
    expect(out).toEqual({ sessionId: "abc" });
  });

  it("redacts export cells with bearer tokens", () => {
    expect(sanitizeExportCell("Bearer abc.def.ghi")).toBe("[redacted]");
  });
});

describe("MetricsService", () => {
  it("track does not throw when store fails", async () => {
    await expect(
      metrics.track({
        eventType: "chat.response",
        category: "chat",
        metadata: { ok: true },
      })
    ).resolves.toBeUndefined();
  });

  it("startTimer end does not throw", () => {
    const timer = metrics.startTimer("rag.retrieve", "rag");
    expect(() => timer.end({ success: true })).not.toThrow();
  });
});

describe("TimeSavedEstimator", () => {
  it("returns null without baselines", () => {
    expect(hasConfiguredBaselines({})).toBe(false);
    expect(formatTimeSavedDisplay(null)).toContain("unavailable");
  });

  it("computes time saved from baselines", () => {
    const settings: MetricsSettings = {
      orgId: "default",
      enabled: true,
      retentionDays: 90,
      taskBaselines: { chat_response: 10 },
      allowDeveloperView: true,
      allowSupportAgentView: false,
      updatedAt: new Date().toISOString(),
    };
    const events: AnalyticsEvent[] = [
      {
        id: "1",
        orgId: "default",
        eventType: "chat.response",
        category: "chat",
        success: true,
        durationMs: 120000,
        createdAt: new Date().toISOString(),
      },
    ];
    const saved = estimateTotalTimeSavedMinutes(events, settings);
    expect(saved).toBe(8);
  });
});

describe("MetricsAggregator rollup math", () => {
  it("aggregates event counts by category", () => {
    const events: AnalyticsEvent[] = [
      {
        id: "1",
        orgId: "default",
        eventType: "investigation.created",
        category: "investigation",
        success: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: "2",
        orgId: "default",
        eventType: "chat.stream",
        category: "chat",
        success: true,
        durationMs: 1000,
        createdAt: new Date().toISOString(),
      },
    ];
    const rollup = computeRollupFromEvents(events, DEFAULT_TASK_BASELINES);
    expect(rollup.eventCount).toBe(2);
    expect(rollup.investigationsCreated).toBe(1);
    expect(rollup.chatResponses).toBe(1);
    expect(rollup.byCategory.investigation).toBe(1);
  });
});

describe("metrics RBAC", () => {
  it("admin can manage settings", () => {
    expect(canManageMetricsSettings("admin")).toBe(true);
    expect(canAccessMetrics("admin")).toBe(true);
  });

  it("developer can access metrics when permitted", () => {
    expect(canAccessMetrics("developer")).toBe(true);
    expect(canManageMetricsSettings("developer")).toBe(false);
  });

  it("viewer blocked by default", () => {
    expect(canAccessMetrics("viewer")).toBe(false);
  });
});
