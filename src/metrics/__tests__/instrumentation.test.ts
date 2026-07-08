import { describe, expect, it, vi, beforeEach } from "vitest";

import { metrics } from "@/metrics/MetricsService";
import * as store from "@/metrics/stores/metrics-store";

describe("workflow instrumentation", () => {
  beforeEach(() => {
    vi.spyOn(store, "insertAnalyticsEvent").mockResolvedValue(undefined);
    vi.spyOn(store, "getMetricsSettings").mockResolvedValue({
      orgId: "default",
      enabled: true,
      retentionDays: 90,
      taskBaselines: {},
      allowDeveloperView: true,
      allowSupportAgentView: false,
      updatedAt: new Date().toISOString(),
    });
  });

  it("emits investigation event metadata", async () => {
    await metrics.track({
      eventType: "investigation.created",
      category: "investigation",
      actorUserId: "u1",
      actorRole: "developer",
      metadata: { sessionId: "sess-1", status: "new-issue" },
    });

    expect(store.insertAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "investigation.created",
        category: "investigation",
        metadata: expect.objectContaining({ sessionId: "sess-1" }),
      })
    );
  });

  it("emits approval workflow events", async () => {
    await metrics.track({
      eventType: "approval.created",
      category: "approval",
      metadata: { approvalId: "ap-1", actionType: "ticket-comment" },
    });

    expect(store.insertAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "approval.created" })
    );
  });
});
