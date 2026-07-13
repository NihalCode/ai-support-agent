import { expect, test } from "@playwright/test";

test.describe("protected admin control plane", () => {
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
    await expect(page.getByRole("navigation", { name: "Administration" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "API and configuration resources" })
    ).toBeVisible();

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
  });

  test("admin shell navigation reaches shared config pages", async ({ page }) => {
    await page.setExtraHTTPHeaders({
      "x-test-role": "admin",
      "x-test-mfa": "true",
    });
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1, name: "Administration" })).toBeVisible();

    await page.getByRole("link", { name: "Change requests" }).click();
    await expect(page).toHaveURL(/\/admin\/change-requests/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Change requests" })
    ).toBeVisible();

    await page.getByRole("link", { name: "Audit logs" }).click();
    await expect(page).toHaveURL(/\/admin\/audit-logs/);
    await expect(page.getByRole("heading", { level: 1, name: "Audit logs" })).toBeVisible();
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

  test("workspace sidebar links to administration for privileged roles", async ({ page }) => {
    await page.setExtraHTTPHeaders({
      "x-test-role": "admin",
      "x-test-mfa": "true",
    });
    await page.goto("/");
    await expect(page.getByTestId("activity-administration")).toBeVisible();
    await page.getByTestId("activity-administration").click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { level: 1, name: "Administration" })).toBeVisible();
    await page.getByTestId("admin-back-to-workspace").click();
    await expect(page).toHaveURL("/");
    await expect(page.getByTestId("ide-root")).toBeVisible();
  });

  test("viewer does not see administration in workspace sidebar", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-test-role": "viewer" });
    await page.goto("/");
    await expect(page.getByTestId("activity-administration")).toHaveCount(0);
  });
});
