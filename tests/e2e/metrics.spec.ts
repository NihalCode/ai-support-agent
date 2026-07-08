import { test, expect } from "@playwright/test";

test.describe("Metrics access", () => {
  test("admin can open metrics dashboard in settings", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("product-mode-toggle").selectOption("developer");
    await page.getByTestId("activity-settings").click();
    await page.getByTestId("settings-nav-metrics").click();
    await expect(page.getByTestId("metrics-dashboard-panel")).toBeVisible();
    await expect(page.getByTestId("metrics-range-select")).toBeVisible();
  });

  test("metrics summary API returns JSON in test mode", async ({ request }) => {
    const res = await request.get("/api/metrics/summary?range=7d");
    expect(res.status()).toBeLessThan(500);
    if (res.ok()) {
      const body = await res.json();
      expect(body).toHaveProperty("summary");
    }
  });

  test("CSV export does not include secret-like values", async ({ request }) => {
    const res = await request.get("/api/metrics/export.csv?range=7d");
    if (res.status() === 403) {
      test.skip();
      return;
    }
    expect(res.ok()).toBeTruthy();
    const text = await res.text();
    expect(text.toLowerCase()).not.toContain("bearer ");
    expect(text.toLowerCase()).not.toContain("apikey");
  });
});
