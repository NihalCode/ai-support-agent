import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("e2e-storage-init")) {
      localStorage.clear();
      sessionStorage.setItem("e2e-storage-init", "1");
    }
  });
});
test.describe("App shell", () => {
  test("loads IDE with activity bar and command palette", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("ide-root")).toBeVisible();
    await expect(page.getByTestId("activity-bar")).toBeVisible();
    await page.getByTestId("open-command-palette").click();
    await expect(page.getByTestId("command-palette")).toBeVisible();
  });

  test("bottom panel terminal tab visible by default", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("bottom-tab-terminal")).toBeVisible();
  });

  test("switches sidebar via search activity", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("activity-search").click();
    await expect(page.getByTestId("sidebar-header-search")).toBeVisible();
    await expect(page.getByTestId("search-sidebar")).toBeVisible();
  });
});

test.describe("Split editor", () => {
  test("splits editor right via command palette and persists", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("open-command-palette").click();
    await page.getByRole("button", { name: "Split Editor Right" }).click();
    await expect(page.locator(".ide-editor-group")).toHaveCount(2);
    await page.reload();
    await expect(page.locator(".ide-editor-group")).toHaveCount(2);
  });
});

test.describe("Semantic search", () => {
  test("returns mocked semantic results in test mode", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("activity-search").click();
    await page.getByTestId("search-mode-semantic").click();
    await page.getByTestId("search-input").fill("tag creation fails with 400");
    await page.getByTestId("search-submit").click();
    await expect(page.getByText("POST /v3/tags/bulk/")).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Chat streaming", () => {
  test("streams assistant response with tool card", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("ai-chat-input").fill("What caused the 400 error?");
    await page.getByTestId("ai-chat-input").press("Enter");
    await expect(page.getByTestId("chat-assistant-message")).toContainText(/bulk tag|missing required field|Start an investigation/i, {
      timeout: 20000,
    });
  });
});

test.describe("Terminal", () => {
  test("runs allowlisted command", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("bottom-tab-terminal").click();
    await expect(page.getByTestId("terminal-panel")).toBeVisible();
    await page.getByTestId("terminal-input").fill("npm test");
    await page.getByTestId("terminal-run").click();
    await expect(page.getByTestId("terminal-output")).toContainText(/passed|vitest|test mode/i, {
      timeout: 30000,
    });
  });

  test("blocks unsafe command", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("bottom-tab-terminal").click();
    await page.getByTestId("terminal-input").fill("rm -rf /");
    await page.getByTestId("terminal-run").click();
    await expect(page.getByText(/blocked|not allowlisted/i)).toBeVisible();
  });
});

test.describe("Investigation workspace", () => {
  test("pins evidence from search", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("activity-search").click();
    await page.getByTestId("search-input").fill("tag");
    await page.getByTestId("search-submit").click();
    await expect(page.getByTestId("pin-evidence").first()).toBeVisible({ timeout: 10000 });
    await page.getByTestId("pin-evidence").first().click();
  });
});

test.describe("CQL workspace", () => {
  test("opens CQL tab via activity bar", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("activity-cql").click();
    await expect(page.getByText("CQL Workspace")).toBeVisible();
  });
});

test.describe("Degraded mode", () => {
  test("shows problems panel warnings", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("bottom-tab-problems").click();
    await expect(page.getByTestId("problems-panel")).toBeVisible();
  });
});
