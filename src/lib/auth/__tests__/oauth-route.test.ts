import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it } from "vitest";

import {
  buildLoginBridgeResponse,
  extractStateFromAuthorizeUrl,
  findTransactionCookie,
  injectTransactionCookieIfMissing,
  isAuthCallbackPath,
  isAuthLoginPath,
  isSuccessfulAuthRedirect,
} from "@/lib/auth/oauth-route-handlers";
import {
  deleteOAuthTransaction,
  loadOAuthTransaction,
  saveOAuthTransaction,
} from "@/lib/auth/oauth-transaction-store";

describe("oauth route helpers", () => {
  it("detects auth login and callback paths", () => {
    expect(isAuthLoginPath("/auth/login")).toBe(true);
    expect(isAuthCallbackPath("/auth/callback")).toBe(true);
    expect(isAuthLoginPath("/login")).toBe(false);
  });

  it("extracts state from authorize URL", () => {
    const url =
      "https://tenant.us.auth0.com/authorize?client_id=x&state=abc123&redirect_uri=https%3A%2F%2Fapp.example%2Fauth%2Fcallback";
    expect(extractStateFromAuthorizeUrl(url)).toBe("abc123");
  });

  it("finds transaction cookies", () => {
    expect(
      findTransactionCookie([
        { name: "other", value: "1" },
        { name: "__txn_", value: "encrypted" },
      ])?.name
    ).toBe("__txn_");
  });

  it("builds HTML bridge with 200 and preserves cookies", () => {
    const authResponse = NextResponse.redirect("https://tenant.us.auth0.com/authorize?state=s1");
    authResponse.cookies.set("__txn_", "value123", { httpOnly: true, sameSite: "lax", path: "/" });

    const bridge = buildLoginBridgeResponse(
      authResponse,
      "https://tenant.us.auth0.com/authorize?state=s1"
    );

    expect(bridge.status).toBe(200);
    expect(bridge.headers.get("content-type")).toContain("text/html");
    expect(bridge.cookies.get("__txn_")?.value).toBe("value123");
    expect(bridge.headers.getSetCookie().some((c) => c.startsWith("__txn_=value123"))).toBe(true);
  });

  it("injects stored transaction cookie on callback when missing", async () => {
    await saveOAuthTransaction({
      state: "state-xyz",
      cookieName: "__txn_",
      cookieValue: "restored-cookie",
    });

    const request = new NextRequest(
      "https://app.example.com/auth/callback?code=abc&state=state-xyz"
    );
    const patched = await injectTransactionCookieIfMissing(request);
    expect(patched.headers.get("cookie")).toContain("__txn_=restored-cookie");

    await deleteOAuthTransaction("state-xyz");
    const cleared = await loadOAuthTransaction("state-xyz");
    expect(cleared).toBeNull();
  });

  it("recognizes successful auth redirects", () => {
    expect(isSuccessfulAuthRedirect(NextResponse.redirect("https://app.example.com/"))).toBe(true);
    expect(
      isSuccessfulAuthRedirect(
        NextResponse.redirect("https://app.example.com/login?error=invalid_state")
      )
    ).toBe(false);
  });
});
