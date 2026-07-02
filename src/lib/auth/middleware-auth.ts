import "server-only";

import type { NextRequest } from "next/server";

import { isAuthEnvComplete } from "@/lib/auth/env";
import { isTestMode } from "@/lib/test-mode";

import { auth0 } from "@/lib/auth0";

function authEnabled(): boolean {
  if (
    isTestMode() ||
    process.env.AUTH_DISABLED === "true"
  ) {
    return false;
  }
  return isAuthEnvComplete();
}

/** Edge-safe Auth0 session probe — no filesystem or user store. */
export async function getMiddlewareAuthUser(
  request: NextRequest
): Promise<{ sub: string; email: string } | null> {
  if (!authEnabled() || !auth0) return null;

  const authSession = await auth0.getSession(request);
  const user = authSession?.user;
  if (!user?.sub || !user.email) return null;
  return { sub: user.sub, email: user.email };
}

export function isMiddlewareAuthEnabled(): boolean {
  return authEnabled();
}
