import { test, expect } from "@playwright/test";
import { assistantText, expectReadableAppSelectMenu, sendChatMessage } from "./helpers/chat";
import { selectAppSelectOption, closeChatDockIfOpen } from "./helpers/workspace";

test.describe("Known issues fixes — full E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test("mode dropdown options are readable (Instant, Balanced, Deep)", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("chat-mode-select-trigger").click();
    await expectReadableAppSelectMenu(page, "chat-mode-select-menu");
    await expect(page.getByTestId("chat-mode-select-menu")).toContainText("Instant");
    await expect(page.getByTestId("chat-mode-select-menu")).toContainText("Balanced");
    await expect(page.getByTestId("chat-mode-select-menu")).toContainText("Deep");
  });

  test("Developer/Admin product mode dropdown is readable", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("product-mode-toggle-trigger").click();
    await expectReadableAppSelectMenu(page, "product-mode-toggle-menu");
    await expect(page.getByTestId("product-mode-toggle-menu")).toContainText("Support Mode");
  });

  test("product mode dropdown is not covered by context panel", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.getByTestId("product-mode-toggle-trigger").click();
    const menu = page.getByTestId("product-mode-toggle-menu");
    await expect(menu).toBeVisible();
    const supportOption = menu.getByRole("option", { name: /Support Mode/i });
    await expect(supportOption).toBeVisible();
    const occluded = await supportOption.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const topEl = document.elementFromPoint(x, y);
      return topEl !== el && !el.contains(topEl);
    });
    expect(occluded).toBe(false);
    await supportOption.click();
    await expect(page.locator('[data-product-mode="client"]')).toHaveAttribute("data-product-mode", "client");
  });

  test("API Registry product dropdown is readable", async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem("ai-support-product-mode", "developer");
    });
    await page.goto("/");
    await expect(page.locator('[data-product-mode="developer"]')).toHaveAttribute(
      "data-product-mode",
      "developer"
    );
    await page.getByTestId("activity-api-registry").click();
    await expect(page.getByTestId("api-registry-spec-select-trigger")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("api-registry-spec-select-trigger")).toContainText(/endpoints\)/i, {
      timeout: 20_000,
    });
    await page.getByTestId("api-registry-spec-select-trigger").click();
    await expectReadableAppSelectMenu(page, "api-registry-spec-select-menu");
  });

  test("Settings integrations has no page-level horizontal overflow at 1024px", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await page.getByTestId("activity-settings").click();
    await page.getByTestId("settings-nav-integrations").click();
    await expect(page.getByTestId("settings-editor")).toBeVisible({ timeout: 10_000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(overflow).toBe(false);
  });

  test("Settings integrations has no page-level horizontal overflow at 1366px", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/");
    await page.getByTestId("activity-settings").click();
    await page.getByTestId("settings-nav-integrations").click();
    await expect(page.getByTestId("settings-editor")).toBeVisible({ timeout: 10_000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(overflow).toBe(false);
  });

  test("Personal Preferences accessibility controls apply CSS variables", async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.getByTestId("activity-settings").click();
    await page.getByTestId("settings-nav-personal-preferences").click();
    await expect(page.getByTestId("personal-preferences-panel")).toBeVisible();
    await page.getByTestId("pref-font-size-trigger").scrollIntoViewIfNeeded();

    await selectAppSelectOption(page, "pref-font-size", /^Large$/);
    const scaleLarge = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--app-font-scale") || "0")
    );
    expect(scaleLarge).toBeGreaterThan(1);

    await selectAppSelectOption(page, "pref-font-family", /^Arial$/);
    const fontFamily = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--app-font-family")
    );
    expect(fontFamily.toLowerCase()).toContain("arial");

    await selectAppSelectOption(page, "pref-contrast", /High Contrast/);
    await expect(page.locator("html.pref-high-contrast")).toBeVisible();

    await page.getByTestId("pref-zoom-in").click();
    await page.getByTestId("pref-zoom-in").click();
    const overflowAfterZoom = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(overflowAfterZoom).toBe(false);

    await closeChatDockIfOpen(page);
    await page.getByTestId("pref-reading-friendly").check({ force: true });
    await expect(page.locator('html[data-reading-friendly="true"]')).toBeVisible();
  });

  test("Build App and Deployments tabs are absent", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("prompt-card-build")).toHaveCount(0);
    await expect(page.getByTestId("activity-build-app")).toHaveCount(0);
    await expect(page.getByTestId("activity-deployments")).toHaveCount(0);
  });

  test("404 prompt routes to API troubleshooting in chat", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await sendChatMessage(page, "404");
    const text = await assistantText(page);
    expect(text).toMatch(/api troubleshooting|understood as: api troubleshooting/);
    expect(text).not.toMatch(/build app|app building|latest commit/);
    await expect(page.getByTestId("chat-error-card")).toHaveCount(0);
  });

  test("upgrade + endpoint + 404 returns endpoint-focused API troubleshooting", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    const msg =
      "After upgrading, POST /v3/indicators/search returns 404. Repo acme/checkout-service if needed.";
    await sendChatMessage(page, msg);
    const text = await assistantText(page);
    expect(text).toMatch(/api troubleshooting|understood as: api troubleshooting/);
    expect(text).toMatch(/404|indicators|search|endpoint|routing|upgrade/);
    expect(text).not.toMatch(/build app|app building/);
    expect(text).not.toMatch(/latest commit|recent commit|git log/);
  });

  test("developer handoff after API error includes structured sections, not commits", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/");
    await sendChatMessage(
      page,
      "After upgrading, POST /v3/indicators/search returns 404. Repo acme/checkout-service if needed."
    );
    await sendChatMessage(page, "Prepare a developer handoff for this issue");
    const text = await assistantText(page);
    expect(text).toContain("developer handoff");
    expect(text).toMatch(/issue summary|error|symptom|reproduction|recommended fix|validation|developer handoff/);
    expect(text).not.toMatch(/investigation session not found/);
    expect(text).not.toMatch(/latest commit|recent commit|git log/);
  });
});
