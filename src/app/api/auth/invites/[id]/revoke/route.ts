import { NextResponse } from "next/server";

import { logAuthEvent } from "@/lib/auth/auth-audit";
import { revokeInvite } from "@/lib/auth/invite-store";
import { requirePermission } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const sessionOrResponse = await requirePermission("users:write");
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  const { id } = await context.params;
  const inviteId = id?.trim();
  if (!inviteId) {
    return NextResponse.json({ error: "Invite id is required" }, { status: 400 });
  }

  const revoked = await revokeInvite(inviteId, sessionOrResponse.user.orgId);
  if (!revoked) {
    return NextResponse.json({ error: "Invite not found or not pending" }, { status: 404 });
  }

  await logAuthEvent({
    action: "auth.invite_revoked",
    actorUserId: sessionOrResponse.user.id,
    actorEmail: sessionOrResponse.user.email,
    targetId: inviteId,
    metadata: { email: revoked.email },
  });

  return NextResponse.json({ invite: revoked });
}
