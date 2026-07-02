import { NextResponse } from "next/server";

import { getInviteByRawToken, isValidPendingInvite } from "@/lib/auth/invite-store";
import { checkRateLimit } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";

/** Public token validation for the invite acceptance page (no email enumeration beyond token). */
export async function GET(request: Request) {
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  if (!checkRateLimit(`invite-validate:${clientIp}`, 30)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ valid: false, reason: "missing_token" }, { status: 400 });
  }

  const invite = await getInviteByRawToken(token);
  if (!invite) {
    return NextResponse.json({ valid: false, reason: "not_found" });
  }

  if (invite.status === "revoked") {
    return NextResponse.json({ valid: false, reason: "revoked", email: invite.email });
  }

  if (invite.status === "accepted") {
    return NextResponse.json({ valid: false, reason: "accepted", email: invite.email });
  }

  if (invite.status === "expired" || !isValidPendingInvite(invite)) {
    return NextResponse.json({ valid: false, reason: "expired", email: invite.email });
  }

  return NextResponse.json({
    valid: true,
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt,
  });
}
