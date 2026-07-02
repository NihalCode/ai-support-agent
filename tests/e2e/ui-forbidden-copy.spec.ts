import { test, expect } from "@playwright/test";

const FORBIDDEN_SUPPORT_COPY = [
  /GitHub \(mock\)/i,
  /Jira: mock/i,
  /RAG: local/i,
  /Agent Trace/i,
  /\/build-app/i,
  /next: command not found/i,
  /\[object Object\]/,
  /\bundefined\b.*\bnull\b/,
];

test.describe("Support Mode forbidden copy", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("product-mode-toggle").selectOption("client");
    await page.getByTestId("activity-home").click();
  });

  test("hides custom Jira configuration in Support Mode", async ({ page }) => {
    await page.getByTestId("activity-settings").click();
    const jira = page.getByTestId("enterprise-integration-jira");
    if ((await jira.count()) > 0) {
      await expect(jira.getByRole("button", { name: /Configure|Save credentials/i })).toHaveCount(0);
    } else {
      await expect(jira).toHaveCount(0);
    }
  });

  test("home dashboard has no forbidden debug labels", async ({ page }) => {
    const body = await page.getByTestId("home-dashboard").innerText();
    for (const re of FORBIDDEN_SUPPORT_COPY) {
      expect(body).not.toMatch(re);
    }
  });

  test("Build App workspace has no raw undefined in readiness sidebar", async ({ page }) => {
    await page.getByTestId("activity-build-app").click();
    await expect(page.getByTestId("build-app-workspace")).toBeVisible({ timeout: 10000 });
    const readiness = await page.getByTestId("build-app-readiness").innerText();
    expect(readiness).not.toMatch(/undefined|null|\[object Object\]/);
  });
});
