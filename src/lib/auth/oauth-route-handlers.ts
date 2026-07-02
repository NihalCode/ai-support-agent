import { NextRequest, NextResponse } from "next/server";

import {
  deleteOAuthTransaction,
  loadOAuthTransaction,
  saveOAuthTransaction,
} from "@/lib/auth/oauth-transaction-store";

export function isAuthLoginPath(pathname: string): boolean {
  return pathname === "/auth/login" || pathname.endsWith("/auth/login");
}

export function isAuthCallbackPath(pathname: string): boolean {
  return pathname === "/auth/callback" || pathname.endsWith("/auth/callback");
}

export function extractStateFromAuthorizeUrl(location: string | null): string | null {
  if (!location) return null;
  try {
    return new URL(location).searchParams.get("state");
  } catch {
    return null;
  }
}

export function findTransactionCookie(
  cookies: { name: string; value: string }[]
): { name: string; value: string } | null {
  const match = cookies.find((c) => c.name === "__txn_" || c.name.startsWith("__txn_"));
  return match ?? null;
}

/** Browsers often drop Set-Cookie on 307 redirects to Auth0 — serve 200 + client redirect instead. */
export function buildLoginBridgeResponse(authResponse: NextResponse, authorizeUrl: string): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="refresh" content="0;url=${encodeURI(authorizeUrl)}" />
  <title>Redirecting to sign in…</title>
</head>
<body>
  <p>Redirecting to sign in… <a href="${encodeURI(authorizeUrl)}">Continue</a></p>
  <script>window.location.replace(${JSON.stringify(authorizeUrl)});</script>
</body>
</html>`;

  const bridge = new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

  for (const cookie of authResponse.cookies.getAll()) {
    bridge.cookies.set(cookie);
  }

  return bridge;
}

export async function persistTransactionFromAuthResponse(authResponse: NextResponse): Promise<void> {
  const authorizeUrl = authResponse.headers.get("location");
  const state = extractStateFromAuthorizeUrl(authorizeUrl);
  const txnCookie = findTransactionCookie(authResponse.cookies.getAll());
  if (!state || !txnCookie?.value) return;
  await saveOAuthTransaction({
    state,
    cookieName: txnCookie.name,
    cookieValue: txnCookie.value,
  });
}

export async function injectTransactionCookieIfMissing(request: NextRequest): Promise<NextRequest> {
  if (!isAuthCallbackPath(request.nextUrl.pathname)) return request;

  const state = request.nextUrl.searchParams.get("state");
  if (!state) return request;

  const existing = findTransactionCookie(request.cookies.getAll());
  if (existing?.value) return request;

  const stored = await loadOAuthTransaction(state);
  if (!stored) return request;

  const headers = new Headers(request.headers);
  const prior = headers.get("cookie");
  headers.set(
    "cookie",
    prior
      ? `${prior}; ${stored.cookieName}=${stored.cookieValue}`
      : `${stored.cookieName}=${stored.cookieValue}`
  );

  return new NextRequest(request.url, { headers });
}

export function isSuccessfulAuthRedirect(response: NextResponse): boolean {
  if (response.status < 300 || response.status >= 400) return false;
  const location = response.headers.get("location") ?? "";
  return !location.includes("/login?error=") && !location.includes("error=invalid_state");
}

export async function cleanupTransactionAfterCallback(
  request: NextRequest,
  response: NextResponse
): Promise<void> {
  if (!isAuthCallbackPath(request.nextUrl.pathname) || !isSuccessfulAuthRedirect(response)) {
    return;
  }
  const state = request.nextUrl.searchParams.get("state");
  if (state) {
    await deleteOAuthTransaction(state);
  }
}
