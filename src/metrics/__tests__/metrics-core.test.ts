import { describe, it, expect } from "vitest";

import { sanitizeMetricsMetadata, sanitizeExportCell } from "../MetricsPrivacy";
import {
  estimateEventTimeSavedMinutes,
  formatTimeSavedDisplay,
  hasConfiguredBaselines,
} from "../TimeSavedEstimator";
import type { AnalyticsEvent } from "../MetricsTypes";

describe("sanitizeMetricsMetadata", () => {
  it("removes secret-like keys", () => {
    const out = sanitizeMetricsMetadata({
      apiKey: "sk-secret",
      ticketId: "12345",
      nested: { password: "x", count: 2 },
    });
    expect(out).toEqual({ ticketId: "12345", nested: { count: 2 } });
  });

  it("redacts bearer tokens in values", () => {
    const out = sanitizeMetricsMetadata({ note: "Bearer abc.def.ghi" });
    expect(out).toBeUndefined();
  });
});

describe("sanitizeExportCell", () => {
  it("redacts jwt-like strings", () => {
    expect(sanitizeExportCell("eyJhbG.eyJzdWI.sig")).toBe("[redacted]");
  });
});

describe("TimeSavedEstimator", () => {
  const event: AnalyticsEvent = {
    id: "e1",
    orgId: "default",
    eventType: "investigation.created",
    category: "investigation",
    success: true,
    durationMs: 120_000,
    createdAt: new Date().toISOString(),
  };

  it("returns unavailable message when baselines missing", () => {
    expect(formatTimeSavedDisplay(null)).toContain("unavailable");
  });

  it("uses configured baseline minus actual duration", () => {
    const chatEvent: AnalyticsEvent = {
      ...event,
      eventType: "chat.response",
      durationMs: 60_000,
    };
    expect(hasConfiguredBaselines({ chat_response: 5 })).toBe(true);
    const saved = estimateEventTimeSavedMinutes(chatEvent, { chat_response: 5 });
    expect(saved).toBe(4);
  });
});
