import { expect, test } from "@playwright/test";

test.describe("protected support-agent control plane", () => {
  test("admin dashboard is noindex and exposes semantic keyboard navigation", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({
      "x-test-role": "admin",
      "x-test-mfa": "true",
    });
    const response = await page.goto("/admin/support-agent/apis");

    expect(response?.headers()["x-robots-tag"]).toContain("noindex");
    await expect(
      page.getByRole("heading", { level: 1, name: "Support Agent APIs" })
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Dashboard sections" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Zendesk diagnostics" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "API credentials" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Immutable audit timeline" })).toBeVisible();

    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    await expect(focused).toBeVisible();
    await expect(focused).toHaveCSS("outline-style", /auto|solid|none/);
  });

  test("developer cannot access production or credential-management affordances", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ "x-test-role": "developer" });
    await page.goto("/admin/support-agent/apis");
    await expect(page.getByText("developer", { exact: true })).toBeVisible();

    const environment = page.getByLabel("Environment").first();
    await expect(environment.locator('option[value="production"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Issue one-time secret" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Run incremental sync" })).toHaveCount(0);
  });

  test("regular users receive API 403 without protected content", async ({ request }) => {
    const response = await request.get("/api/admin/control-plane/context", {
      headers: { "x-test-role": "viewer" },
    });
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body).toMatchObject({ error: "Forbidden" });
    expect(JSON.stringify(body)).not.toContain("csrfToken");
    expect(JSON.stringify(body)).not.toContain("organization");
  });
});
