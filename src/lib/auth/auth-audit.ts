import "server-only";

import { appendAuditLog } from "@/lib/support/enterprise/stores/audit-store";

export async function logAuthEvent(input: {
  action: string;
  actorUserId?: string;
  actorEmail?: string;
  targetId?: string;
  status?: "completed" | "rejected" | "failed";
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await appendAuditLog({
    actorUserId: input.actorUserId ?? "system",
    actorEmail: input.actorEmail,
    action: input.action,
    targetSystem: "auth0",
    targetId: input.targetId,
    status: input.status ?? "completed",
    metadata: input.metadata,
  });
}
