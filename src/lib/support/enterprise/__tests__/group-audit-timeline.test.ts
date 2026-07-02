import { describe, it, expect } from "vitest";
import { groupAuditTimeline } from "@/lib/support/enterprise/group-audit-timeline";
import type { EnterpriseAuditLog } from "@/lib/support/enterprise/types";

function entry(partial: Partial<EnterpriseAuditLog> & Pick<EnterpriseAuditLog, "id" | "action">): EnterpriseAuditLog {
  return {
    actorUserId: "u1",
    targetSystem: "slack",
    status: "completed",
    createdAt: "2026-07-01T12:00:00.000Z",
    ...partial,
  };
}

describe("groupAuditTimeline", () => {
  it("groups Slack thread events by channel:threadTs target", () => {
    const groups = groupAuditTimeline([
      entry({
        id: "1",
        action: "slack:event",
        targetId: "C123:111.222",
        createdAt: "2026-07-01T12:00:00.000Z",
      }),
      entry({
        id: "2",
        action: "slack:enrich-error",
        targetId: "C123:111.222",
        createdAt: "2026-07-01T12:01:00.000Z",
      }),
      entry({
        id: "3",
        action: "approval:create",
        targetSystem: "app",
        targetId: "apr-1",
        createdAt: "2026-07-01T13:00:00.000Z",
      }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.kind === "slack_thread")?.entries).toHaveLength(2);
  });
});
