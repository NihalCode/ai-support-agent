import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getMiddlewareAuthUser, isMiddlewareAuthEnabled } from "@/lib/auth/middleware-auth";
import { auth0 } from "@/lib/auth0";

const PUBLIC_PATHS = ["/login", "/auth"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  if (!isMiddlewareAuthEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/auth")) {
    return auth0!.middleware(request);
  }

  const authResponse = await auth0!.middleware(request);
  const authUser = await getMiddlewareAuthUser(request);

  if (pathname.startsWith("/api/")) {
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
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
