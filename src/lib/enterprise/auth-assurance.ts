import type { AppSession } from "@/lib/auth/session";

export interface AuthAssuranceResult {
  ok: boolean;
  reason?: "mfa_required" | "recent_auth_required";
}

export function hasPrivilegedMfa(session: AppSession): boolean {
  const methods = session.assurance?.amr?.map((value) => value.toLowerCase()) ?? [];
  const acr = session.assurance?.acr?.toLowerCase() ?? "";
  return (
    methods.some((method) => ["mfa", "otp", "webauthn", "hwk"].includes(method)) ||
    acr.includes("mfa") ||
    acr.includes("multi-factor")
  );
}

export function hasRecentAuthentication(
  session: AppSession,
  maxAgeSeconds = 10 * 60,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  const authTime = session.assurance?.authTime;
  if (typeof authTime !== "number") return false;
  const age = nowSeconds - authTime;
  return age >= -60 && age <= maxAgeSeconds;
}

export function checkStepUpAuthentication(
  session: AppSession,
  options: { requireMfa?: boolean; maxAuthAgeSeconds?: number } = {}
): AuthAssuranceResult {
  if (options.requireMfa && !hasPrivilegedMfa(session)) {
    return { ok: false, reason: "mfa_required" };
  }
  if (
    options.maxAuthAgeSeconds != null &&
    !hasRecentAuthentication(session, options.maxAuthAgeSeconds)
  ) {
    return { ok: false, reason: "recent_auth_required" };
  }
  return { ok: true };
}
