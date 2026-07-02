import { NextResponse } from "next/server";

import { checkEmailAccess } from "@/lib/auth/invite-gate";
import { normalizeEmail, isValidEmail } from "@/lib/auth/email-utils";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { cleanEnvValue } from "@/lib/auth/env";

export const runtime = "nodejs";

interface InviteCheckRequest {
  email?: string;
  auth0UserId?: string;
  connection?: string;
}

interface InviteCheckResponse {
  allowed: boolean;
  reason?: "active_user" | "valid_invite" | "not_invited" | "disabled" | "expired_invite";
  role?: string;
}

function sharedSecret(): string | null {
  return cleanEnvValue(process.env.AUTH0_ACTION_SHARED_SECRET);
}

/** Server-to-server invite gate for Auth0 Post-Login Actions. */
export async function POST(request: Request) {
  const secret = sharedSecret();
  if (!secret) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization")?.trim();
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const headerSecret = request.headers.get("x-auth0-action-secret")?.trim();
  const provided = bearer ?? headerSecret;

  if (!provided || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  if (!checkRateLimit(`invite-check:${clientIp}`)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: InviteCheckRequest;
  try {
    body = (await request.json()) as InviteCheckRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim();
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  const result = await checkEmailAccess(normalizeEmail(email));
  const response: InviteCheckResponse = {
    allowed: result.allowed,
    reason: result.reason,
    role: result.role,
  };

  return NextResponse.json(response);
}
