import { test, expect } from "@playwright/test";

/**
 * OAuth login bridge checks — run against production when AUTH0_E2E=1.
 * Example: AUTH0_E2E=1 npx playwright test tests/e2e/auth-oauth.spec.ts
 */
const authE2e = process.env.AUTH0_E2E === "1";
const baseURL = process.env.AUTH0_E2E_BASE_URL ?? "https://ai-support-agent-ecru.vercel.app";

test.describe("Auth0 OAuth bridge", () => {
  test.skip(!authE2e, "Set AUTH0_E2E=1 to run live Auth0 smoke tests");

  test("login returns HTML bridge (200) with transaction cookie", async ({ request }) => {
    const res = await request.get(`${baseURL}/auth/login`, { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"] ?? "").toContain("text/html");
    const body = await res.text();
    expect(body).toContain("Redirecting to sign in");
    expect(body).toContain("auth0.com/authorize");

    const setCookie = res.headers()["set-cookie"] ?? "";
    expect(setCookie).toMatch(/__txn_/);
  });

  test("login landing uses full-page SSO link", async ({ page }) => {
    await page.goto(`${baseURL}/login`);
    const link = page.getByTestId("login-continue");
    await expect(link).toHaveAttribute("href", "/auth/login");
  });
});
