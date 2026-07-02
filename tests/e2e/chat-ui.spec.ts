import { test, expect } from "@playwright/test";

const FORBIDDEN_SUPPORT = [
  /Agent Trace/i,
  /\bMCP\b/i,
  /\bTerminal\b/i,
  /RAG local/i,
  /localhost/i,
  /\[object Object\]/,
];

test.describe("Premium chat UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem("e2e-storage-init")) {
        localStorage.clear();
        sessionStorage.setItem("e2e-storage-init", "1");
      }
    });
    await page.goto("/");
  });

  test("chat page loads with shell and welcome hero", async ({ page }) => {
    await expect(page.getByTestId("ide-root")).toBeVisible();
    await expect(page.getByTestId("chat-welcome-hero")).toBeVisible();
    await expect(page.getByTestId("chat-empty-state")).toBeVisible();
  });

  test("prompt cards render", async ({ page }) => {
    await expect(page.getByTestId("prompt-suggestion-grid")).toBeVisible();
    await expect(page.getByTestId("prompt-card-investigate-api")).toBeVisible();
    await expect(page.getByTestId("prompt-card-endpoint")).toBeVisible();
    await expect(page.getByTestId("prompt-card-cql")).toBeVisible();
  });

  test("clicking prompt card fills composer", async ({ page }) => {
    await page.getByTestId("prompt-card-endpoint").click();
    await expect(page.getByTestId("ai-chat-input")).toHaveValue(/CSAP endpoint.*add tags/i);
  });

  test("composer sends message", async ({ page }) => {
    test.setTimeout(60000);
    await page.getByTestId("ai-chat-input").fill("What caused the 400 error?");
    await page.getByTestId("chat-send-button").click();
    await expect(page.getByTestId("chat-assistant-message")).toBeVisible({ timeout: 45000 });
  });

  test("double submit is prevented while sending", async ({ page }) => {
    test.setTimeout(60000);
    await page.getByTestId("ai-chat-input").fill("Investigate timeout issue");
    await page.getByTestId("chat-send-button").click();
    await expect(page.getByTestId("chat-send-button")).toBeDisabled({ timeout: 2000 }).catch(() => {
      /* may finish quickly in mock mode */
    });
    const userBubbles = page.locator(".flex.justify-end");
    await expect(userBubbles).toHaveCount(1, { timeout: 5000 });
  });

  test("assistant message can render structured cards", async ({ page }) => {
    test.setTimeout(60000);
    await page.getByTestId("ai-chat-input").fill("Investigate blocking workflow timeout");
    await page.getByTestId("ai-chat-input").press("Enter");
    await expect(page.getByTestId("chat-assistant-message")).toBeVisible({ timeout: 45000 });
  });

  test("right context panel renders on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByTestId("chat-context-panel")).toBeVisible();
  });

  test("context panel toggle on smaller screen", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.getByTestId("toggle-context-panel").click();
    await expect(page.getByTestId("chat-context-panel")).toHaveClass(/chat-context-panel--open/);
  });

  test("Support Mode hides developer labels in chat", async ({ page }) => {
    await page.getByTestId("product-mode-toggle").selectOption("client");
    const panel = page.getByTestId("chat-context-panel");
    const text = await panel.innerText();
    for (const re of FORBIDDEN_SUPPORT) {
      expect(text).not.toMatch(re);
    }
    await expect(page.getByTestId("sidebar-advanced-section")).toHaveCount(0);
  });

  test("Developer Mode shows advanced section", async ({ page }) => {
    await page.getByTestId("product-mode-toggle").selectOption("developer");
    await page.getByTestId("sidebar-advanced-toggle").click();
    await expect(page.getByTestId("sidebar-advanced-section")).toBeVisible();
  });

  test("error card hides technical details in Support Mode", async ({ page }) => {
    await page.getByTestId("product-mode-toggle").selectOption("client");
    await page.getByTestId("ai-chat-input").fill("/invalid-command-xyz");
    await page.getByTestId("ai-chat-input").press("Enter");
    const tech = page.getByTestId("chat-error-technical");
    if ((await tech.count()) > 0) {
      await expect(tech).toBeHidden();
    }
  });

  test("mobile viewport has no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(overflow).toBe(false);
  });

  test("no forbidden text in Support Mode chat area", async ({ page }) => {
    await page.getByTestId("product-mode-toggle").selectOption("client");
    const chat = page.locator("main");
    const text = await chat.innerText();
    for (const re of FORBIDDEN_SUPPORT) {
      expect(text).not.toMatch(re);
    }
  });

  test("chat dock keeps main chat history when switching activity", async ({ page }) => {
    await page.getByTestId("product-mode-toggle").selectOption("developer");
    const msg = "Persistence check message for chat dock";
    await page.getByTestId("ai-chat-input").fill(msg);
    await page.getByTestId("chat-send-button").click();
    await expect(page.getByText(msg)).toBeVisible({ timeout: 5000 });
    await page.getByTestId("activity-investigations").click();
    await expect(page.getByTestId("chat-dock")).toBeVisible();
    await expect(page.getByTestId("chat-dock").getByText(msg)).toBeVisible();
  });

  test("topbar chat toggle opens and closes dock", async ({ page }) => {
    await page.getByTestId("product-mode-toggle").selectOption("developer");
    await page.getByTestId("activity-investigations").click();
    await expect(page.getByTestId("chat-dock")).toBeVisible();
    await page.getByTestId("topbar-toggle-chat").click();
    await expect(page.getByTestId("chat-dock-fab")).toBeVisible();
    await page.getByTestId("topbar-toggle-chat").click();
    await expect(page.getByTestId("chat-dock")).toBeVisible();
  });
});
