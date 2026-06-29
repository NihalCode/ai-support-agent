import type { NextRequest } from "next/server";

import { auth0 } from "@/lib/auth0";

function authEnabled(): boolean {
  if (
    process.env.TEST_MODE === "true" ||
    process.env.NEXT_PUBLIC_TEST_MODE === "true" ||
    process.env.AUTH_DISABLED === "true"
  ) {
    return false;
  }
  const clean = (v: string | undefined) => (v?.trim() ? v.trim() : "");
  return Boolean(
    clean(process.env.AUTH0_DOMAIN) &&
      clean(process.env.AUTH0_CLIENT_ID) &&
      clean(process.env.AUTH0_CLIENT_SECRET) &&
      clean(process.env.AUTH0_SECRET)
  );
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
