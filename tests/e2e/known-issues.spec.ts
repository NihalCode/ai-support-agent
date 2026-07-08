import { test, expect } from "@playwright/test";

test.describe("Known issues fixes", () => {
  test("mode dropdown uses custom AppSelect menu", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("chat-welcome-hero")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("chat-mode-select-trigger").click();
    await expect(page.getByTestId("chat-mode-select-menu")).toBeVisible();
    await expect(page.getByTestId("chat-mode-select-menu")).toContainText("Balanced");
    await expect(page.getByTestId("chat-mode-select-menu")).toContainText("Instant");
  });

  test("product mode dropdown is readable", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("product-mode-toggle-trigger").click();
    await expect(page.getByTestId("product-mode-toggle-menu")).toBeVisible();
    await expect(page.getByTestId("product-mode-toggle-menu")).toContainText("Support Mode");
  });

  test("Settings personal preferences section exists", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("activity-settings").click();
    await expect(page.getByTestId("settings-editor")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("settings-nav-personal-preferences").click();
    await expect(page.getByTestId("personal-preferences-panel")).toBeVisible();
    await expect(page.getByTestId("pref-font-size")).toBeVisible();
  });

  test("Settings integrations has no page-level horizontal overflow at 1366px", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/");
    await page.getByTestId("activity-integrations").click();
    await expect(page.getByTestId("settings-editor")).toBeVisible({ timeout: 10000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });

  test("Build App tab is absent from welcome", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("prompt-card-build")).toHaveCount(0);
  });
});
