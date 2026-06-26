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
    test.setTimeout(60000);
    await page.goto("/");
    await page.getByTestId("ai-chat-input").fill("What caused the 400 error?");
    await page.getByTestId("ai-chat-input").press("Enter");
    await expect(page.getByTestId("chat-assistant-message")).toContainText(
      /bulk tag|missing required field|investigate this|What I understood/i,
      { timeout: 45000 }
    );
    await expect(page.getByText(/No active session|Start an investigation first|Run Investigate first/i)).toHaveCount(0);
  });

  test("auto-creates investigation from non-technical support message", async ({ page }) => {
    test.setTimeout(90000);
    await page.goto("/");
    const message =
      "Our block malicious IP workflow stops after about half a minute. Ticket AISUPS-1. I don't know the endpoint.";
    await page.getByTestId("ai-chat-input").fill(message);
    await page.getByTestId("ai-chat-input").press("Enter");
    await expect(page.getByTestId("chat-assistant-message")).toContainText(/investigate|AISUPS-1|block|workflow/i, {
      timeout: 45000,
    });
    await expect(page.getByText(/No active session|Start an investigation first|Run Investigate first/i)).toHaveCount(0);
    await expect(page.getByText(/Started investigation|create_investigation|Checking/i).first()).toBeVisible({
      timeout: 45000,
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

test.describe("Chat build app routing", () => {
  test("routes build request from main chat to app builder", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/");
    const msg =
      "Build me a simple indicator search dashboard using Cyware APIs with search box and table results.";
    await page.getByTestId("ai-chat-input").fill(msg);
    await page.getByTestId("ai-chat-input").press("Enter");
    await expect(page.getByTestId("chat-assistant-message")).toContainText(
      /indicator-search-dashboard|Build App|template/i,
      { timeout: 20000 }
    );
    await expect(page.getByText(/appBuilder|plan_app/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("build-app-workspace")).toBeVisible({ timeout: 15000 });
  });
});

test.describe("Build App workspace", () => {
  test("generates scaffold plan and approves in test mode", async ({ page }) => {
    test.setTimeout(90000);
    await page.goto("/");
    await page.getByTestId("activity-build-app").click();
    await page.getByTestId("build-app-new").click();
    await expect(page.getByTestId("build-app-workspace")).toBeVisible({ timeout: 10000 });
    const msg =
      "Build me a simple indicator search dashboard using Cyware APIs. Search box, optional CQL filter, table results, and details panel. Prepare for Vercel deployment.";
    await page.getByTestId("build-app-input").fill(msg);
    await page.getByTestId("build-app-plan").click();
    await expect(page.getByTestId("build-app-explanation")).toContainText(/indicator-search-dashboard|indicator search/i, {
      timeout: 15000,
    });
    await expect(page.getByTestId("build-app-approve")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("build-app-approve").click();
    await expect(page.getByTestId("build-app-build")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("build-app-build").click();
    await expect(page.getByTestId("build-app-output")).toContainText(/mock|passed/i, { timeout: 15000 });
    await page.getByTestId("build-app-deploy-preview").click();
    await expect(page.getByTestId("build-app-preview-url")).toContainText(/mock-preview\.vercel\.app|mock/i, {
      timeout: 20000,
    });
  });
});

test.describe("Investigation workspace UI", () => {
  test("shows plain-English input and optional advanced fields", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("activity-investigations").click();
    await expect(page.getByTestId("investigation-issue-input")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Describe the problem in your own words/i)).toBeVisible();
    await page.getByTestId("investigation-advanced-toggle").click();
    await expect(page.getByTestId("investigation-advanced-fields")).toBeVisible();
    await expect(page.getByText(/Endpoint, if you know it/i)).toBeVisible();
    await page.getByTestId("investigation-mode-toggle").click();
    await expect(page.getByText(/Technical mode/i)).toBeVisible();
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

test.describe("Jira sidebar", () => {
  test("finds mock ticket by key and opens editor", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("activity-jira").click();
    await expect(page.getByTestId("jira-sidebar")).toBeVisible();
    await page.getByTestId("jira-search-input").fill("PAY-101");
    await page.getByTestId("jira-search-submit").click();
    await expect(page.getByTestId("jira-result-PAY-101")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("jira-ticket-editor")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("jira-ticket-editor")).toContainText(/PAY-101|Stripe|webhook/i);
  });

  test("shows error for empty search", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("activity-jira").click();
    await page.getByTestId("jira-search-submit").click();
    await expect(page.getByTestId("jira-search-error")).toBeVisible();
  });
});

test.describe("MCP sidebar", () => {
  test("shows MCP status note", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("activity-mcp").click();
    await expect(page.getByTestId("mcp-sidebar")).toBeVisible();
    await expect(page.getByTestId("mcp-sidebar-note")).toBeVisible();
  });
});

test.describe("Investigations sidebar", () => {
  test("lists saved investigations in test mode", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("activity-investigations").click();
    await expect(page.getByTestId("investigations-sidebar")).toBeVisible();
    await expect(page.locator('[data-testid^="investigation-"]').first()).toBeVisible({ timeout: 10000 });
  });
});
