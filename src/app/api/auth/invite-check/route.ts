import { NextResponse } from "next/server";

import { resolveActionSharedSecret } from "@/lib/auth/action-shared-secret";
import { isInitialOwnerEmail } from "@/lib/auth/auth-config-public";
import type { InviteCheckResponse } from "@/lib/auth/access-denied";
import { normalizeEmail, isValidEmail } from "@/lib/auth/email-utils";
import { checkEmailAccess } from "@/lib/auth/invite-gate";
import { checkRateLimit } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";

interface InviteCheckRequest {
  email?: string;
  auth0UserId?: string;
  connection?: string;
  clientId?: string;
  app?: string;
}

function jsonInviteCheck(body: InviteCheckResponse, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}

function configurationError(): NextResponse {
  return jsonInviteCheck({
    allowed: false,
    reason: "auth_configuration_error",
  });
}

/** Server-to-server invite gate for Auth0 Post-Login Actions. Always returns JSON. */
export async function POST(request: Request) {
  const secret = resolveActionSharedSecret();
  if (!secret) {
    return configurationError();
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

  const normalized = normalizeEmail(email);

  try {
    const result = await checkEmailAccess(normalized);
    const response: InviteCheckResponse = {
      allowed: result.allowed,
      reason: result.reason,
      role: result.role,
    };
    return jsonInviteCheck(response);
  } catch {
    if (isInitialOwnerEmail(normalized)) {
      return jsonInviteCheck({
        allowed: true,
        reason: "bootstrap_owner",
        role: "owner",
      });
    }
    return configurationError();
  }
}
