import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getMiddlewareAuthUser, isMiddlewareAuthEnabled } from "@/lib/auth/middleware-auth";
import { auth0 } from "@/lib/auth0";

const PUBLIC_PATHS = ["/login", "/access-denied", "/invite", "/auth"];

/** Webhooks verified by provider signature — not Auth0 session. */
const PUBLIC_API_PREFIXES = [
  "/api/slack/",
  "/api/integrations/slack/events",
];

/** Session-optional API routes (handler returns authenticated: false when logged out). */
const PUBLIC_API_EXACT = [
  "/api/auth/me",
  "/api/auth/invite-check",
  "/api/auth/invites/validate",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isPublicApiPath(pathname: string): boolean {
  if (PUBLIC_API_EXACT.includes(pathname)) return true;
  return PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  if (!isMiddlewareAuthEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  const authResponse = await auth0!.middleware(request);
  const authUser = await getMiddlewareAuthUser(request);

  if (pathname.startsWith("/api/")) {
    if (isPublicApiPath(pathname)) {
      return authResponse;
    }
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return authResponse;
  }

  if (!authUser && !isPublicPath(pathname)) {
    const login = new URL("/auth/login", request.url);
    login.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(login);
  }

  return authResponse;
}

export const config = {
  matcher: [
    /*
     * Skip static assets (public/ and built-ins) so Auth0 and browsers can fetch
     * branding files like /cyware_logo.png without a session.
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|auth(?:/|$)|.*\\.(?:png|svg|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
