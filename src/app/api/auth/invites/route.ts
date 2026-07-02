import { NextResponse } from "next/server";

import { logAuthEvent } from "@/lib/auth/auth-audit";
import { isValidEmail, normalizeEmail } from "@/lib/auth/email-utils";
import {
  buildInviteUrl,
  createInvite,
  getAppBaseUrl,
  listInvites,
  parseInviteRole,
} from "@/lib/auth/invite-store";
import { requirePermission } from "@/lib/auth/session";
import { USER_ROLES } from "@/lib/auth/roles";

export const runtime = "nodejs";

export async function GET() {
  const sessionOrResponse = await requirePermission("users:read");
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  const invites = await listInvites(sessionOrResponse.user.orgId);
  return NextResponse.json({ invites, roles: USER_ROLES });
}

export async function POST(request: Request) {
  const sessionOrResponse = await requirePermission("users:write");
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  let body: { email?: string; role?: string; expiryDays?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim();
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  const role = parseInviteRole(body.role);
  if (!role) {
    return NextResponse.json({ error: "Valid role is required" }, { status: 400 });
  }

  const expiryDays =
    body.expiryDays != null && Number.isFinite(body.expiryDays) && body.expiryDays > 0
      ? Math.floor(body.expiryDays)
      : undefined;

  const { invite, rawToken } = await createInvite({
    email: normalizeEmail(email),
    role,
    invitedByUserId: sessionOrResponse.user.id,
    orgId: sessionOrResponse.user.orgId,
    expiryDays,
  });

  await logAuthEvent({
    action: "auth.invite_created",
    actorUserId: sessionOrResponse.user.id,
    actorEmail: sessionOrResponse.user.email,
    targetId: invite.id,
    metadata: { email: invite.email, role: invite.role },
  });

  const inviteUrl = buildInviteUrl(rawToken, getAppBaseUrl());

  return NextResponse.json({ invite, inviteUrl });
}
