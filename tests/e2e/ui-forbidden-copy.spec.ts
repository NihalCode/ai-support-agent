import { test, expect } from "@playwright/test";
import { switchToSupportMode } from "./helpers/workspace";

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
    await switchToSupportMode(page);
    await page.getByTestId("activity-home").click();
  });

  test("hides custom Jira configuration in Support Mode", async ({ page }) => {
    await page.getByTestId("activity-integrations").click();
    const jira = page.getByTestId("enterprise-integration-jira");
    if ((await jira.count()) > 0) {
      await expect(jira.getByRole("button", { name: /Configure|Save credentials/i })).toHaveCount(0);
    } else {
      await expect(jira).toHaveCount(0);
    }
  });

  test("home chat has no forbidden debug labels", async ({ page }) => {
    const body = await page.getByTestId("chat-welcome-hero").innerText();
    for (const re of FORBIDDEN_SUPPORT_COPY) {
      expect(body).not.toMatch(re);
    }
  });
});
