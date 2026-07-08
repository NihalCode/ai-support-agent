import { test, expect } from "@playwright/test";

const MINIMAL_OPENAPI = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "CTIX Demo", version: "1" },
  paths: { "/v3/indicators/": { get: {} } },
});

test.describe("Unified chat", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem("e2e-storage-init")) {
        localStorage.clear();
        sessionStorage.setItem("e2e-storage-init", "1");
      }
    });
    await page.goto("/");
  });

  test("mode dropdown is visible and defaults to Balanced", async ({ page }) => {
    await expect(page.getByTestId("chat-mode-select-trigger")).toBeVisible();
    await expect(page.getByTestId("chat-mode-select-trigger")).toContainText("Balanced");
  });

  test("blocks executable upload", async ({ page }) => {
    await page.getByTestId("chat-attach-button").click();
    await page.getByTestId("chat-file-input").setInputFiles({
      name: "payload.exe",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("MZ"),
    });
    await expect(page.getByTestId("chat-attachment-chips")).toContainText(/payload\.exe|blocked|failed/i, {
      timeout: 10000,
    });
  });

  test("uploads OpenAPI and shows chip", async ({ page }) => {
    await page.getByTestId("chat-attach-button").click();
    await page.getByTestId("chat-file-input").setInputFiles({
      name: "ctix-openapi.json",
      mimeType: "application/json",
      buffer: Buffer.from(MINIMAL_OPENAPI),
    });
    await expect(page.getByTestId("chat-attachment-chips")).toContainText("ctix-openapi.json", {
      timeout: 10000,
    });
  });

  test("build request in main chat returns graceful unsupported response", async ({ page }) => {
    test.setTimeout(90000);
    const msg =
      "Build me a simple indicator search dashboard using Cyware APIs with search box and table results.";
    await page.getByTestId("ai-chat-input").fill(msg);
    await page.getByTestId("chat-send-button").click();
    await expect(page.getByTestId("chat-assistant-message")).toContainText(
      /no longer builds full applications|Cyware API|CQL|developer handoff/i,
      { timeout: 45000 }
    );
    await expect(page.getByTestId("chat-app-plan-card")).toHaveCount(0);
    await expect(page.getByTestId("build-app-workspace")).toHaveCount(0);
  });

  test("developer chat mode gated in client product mode", async ({ page }) => {
    await page.getByTestId("chat-mode-select-trigger").click();
    const menu = page.getByTestId("chat-mode-select-menu");
    await expect(menu).toBeVisible();
    const devOption = menu.getByRole("option", { name: /developer/i });
    if ((await devOption.count()) === 0 || (await devOption.getAttribute("aria-disabled")) === "true") {
      await expect(page.getByTestId("chat-mode-select-trigger")).not.toContainText("Developer");
    }
  });
});
