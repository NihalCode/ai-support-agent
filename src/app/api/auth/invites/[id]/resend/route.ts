import { type NextRequest, NextResponse } from "next/server";

import { logAuthEvent } from "@/lib/auth/auth-audit";
import {
  buildInviteUrl,
  getAppBaseUrl,
  resendInvite,
} from "@/lib/auth/invite-store";
import { requirePermission } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const sessionOrResponse = await requirePermission("users:write", request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  const { id } = await context.params;
  const inviteId = id?.trim();
  if (!inviteId) {
    return NextResponse.json({ error: "Invite id is required" }, { status: 400 });
  }

  const result = await resendInvite(inviteId, sessionOrResponse.user.orgId);
  if (!result) {
    return NextResponse.json({ error: "Invite not found or not pending" }, { status: 404 });
  }

  await logAuthEvent({
    action: "auth.invite_resent",
    actorUserId: sessionOrResponse.user.id,
    actorEmail: sessionOrResponse.user.email,
    targetId: inviteId,
    metadata: { email: result.invite.email },
  });

  const inviteUrl = buildInviteUrl(result.rawToken, getAppBaseUrl());
  return NextResponse.json({ invite: result.invite, inviteUrl });
}
