import { test, expect, type Page } from "@playwright/test";

async function openDeveloperInvestigations(page: Page) {
  await page.getByTestId("product-mode-toggle").selectOption("developer");
  await page.getByTestId("activity-investigations").click();
}

async function openDeveloperBottomPanel(page: Page) {
  await openDeveloperInvestigations(page);
  await page.getByTestId("open-command-palette").click();
  await page.getByRole("button", { name: "Toggle Bottom Panel" }).click();
  if (await page.getByTestId("chat-dock-close").isVisible().catch(() => false)) {
    await page.getByTestId("chat-dock-close").click();
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("e2e-storage-init")) {
      localStorage.clear();
      sessionStorage.setItem("e2e-storage-init", "1");
    }
  });
});
test.describe("App shell", () => {
  test("loads client IDE with activity bar and welcome chat", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("ide-root")).toBeVisible();
    await expect(page.getByTestId("activity-bar")).toBeVisible();
    await expect(page.getByTestId("chat-welcome-hero")).toBeVisible();
    await expect(page.getByTestId("open-command-palette")).toHaveCount(0);
  });

  test("developer mode shows command palette", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("product-mode-toggle").selectOption("developer");
    await page.getByTestId("open-command-palette").click();
    await expect(page.getByTestId("command-palette")).toBeVisible();
  });

  test("client mode hides developer bottom panel by default", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("bottom-tab-terminal")).toHaveCount(0);
  });

  test("developer mode shows bottom panel in editor view", async ({ page }) => {
    await page.goto("/");
    await openDeveloperBottomPanel(page);
    await expect(page.getByTestId("bottom-tab-terminal")).toBeVisible();
  });

  test("switches sidebar via search activity", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("product-mode-toggle").selectOption("developer");
    await page.getByTestId("activity-search").click();
    await expect(page.getByTestId("sidebar-header-search")).toBeVisible();
    await expect(page.getByTestId("search-sidebar")).toBeVisible();
  });
});

test.describe("Split editor", () => {
  test("splits editor right via command palette and persists", async ({ page }) => {
    await page.goto("/");
    await openDeveloperInvestigations(page);
    await page.getByTestId("open-command-palette").click();
    await page.getByRole("button", { name: "Split Editor Right" }).click();
    await expect(page.locator(".ide-editor-group")).toHaveCount(2);
    await page.reload();
    await openDeveloperInvestigations(page);
    await expect(page.locator(".ide-editor-group")).toHaveCount(2);
  });
});

test.describe("Semantic search", () => {
  test("returns mocked semantic results in test mode", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("product-mode-toggle").selectOption("developer");
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

  test("double send does not duplicate user message", async ({ page }) => {
    await page.goto("/");
    const msg = "duplicate send guard check";
    const input = page.getByTestId("ai-chat-input");
    await input.fill(msg);
    await Promise.all([input.press("Enter"), input.press("Enter")]);
    await expect(page.getByText(msg, { exact: true })).toHaveCount(1);
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
    await openDeveloperBottomPanel(page);
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
    await openDeveloperBottomPanel(page);
    await page.getByTestId("bottom-tab-terminal").click();
    await page.getByTestId("terminal-input").fill("rm -rf /");
    await page.getByTestId("terminal-run").click();
    await expect(page.getByText(/blocked|not allowlisted/i)).toBeVisible();
  });
});

test.describe("Chat build app routing", () => {
  test("returns graceful unsupported response for build requests", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/");
    const msg =
      "Build me a simple indicator search dashboard using Cyware APIs with search box and table results.";
    await page.getByTestId("ai-chat-input").fill(msg);
    await page.getByTestId("chat-send-button").click();
    await expect(page.getByTestId("chat-assistant-message")).toContainText(
      /no longer builds full applications|cannot build full apps|endpoint|CQL|developer handoff/i,
      { timeout: 45000 }
    );
    await expect(page.getByTestId("chat-app-plan-card")).toHaveCount(0);
    await expect(page.getByTestId("build-app-workspace")).toHaveCount(0);
  });
});

test.describe("Natural-language agent routing", () => {
  test("E2E NL build app from main chat returns unsupported message", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/");
    const msg =
      "I need a small internal tool where analysts can search indicators and click into details.";
    await page.getByTestId("ai-chat-input").fill(msg);
    await page.getByTestId("chat-send-button").click();
    await expect(page.getByTestId("chat-app-plan-card")).toHaveCount(0);
    await expect(page.getByTestId("chat-assistant-message")).toContainText(
      /no longer builds full applications|cannot build full apps|endpoint|CQL/i,
      { timeout: 45000 }
    );
  });

  test("E2E NL investigation auto-create", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/");
    const msg =
      "The automation that blocks malicious IPs stopped working yesterday. I do not know the endpoint.";
    await page.getByTestId("ai-chat-input").fill(msg);
    await page.getByTestId("ai-chat-input").press("Enter");
    await expect(page.getByTestId("chat-assistant-message")).toContainText(
      /Understood as: diagnose|investigate|I'll investigate/i,
      { timeout: 25000 }
    );
    await expect(page.getByText(/Run investigation first/i)).toHaveCount(0);
  });

  test("E2E NL CQL query routes to CQL help not incident", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/");
    const msg =
      "Write a CQL query for malicious IP indicators in the last 24 hours with confidence >= 90. Link the relevant CQL grammar docs.";
    await page.getByTestId("ai-chat-input").fill(msg);
    await page.getByTestId("ai-chat-input").press("Enter");
    await expect(page.getByTestId("chat-assistant-message")).toContainText(/CQL query help|Suggested CQL/i, {
      timeout: 30000,
    });
    await expect(page.getByTestId("chat-assistant-message")).not.toContainText(/\{\{base_url\}\}/);
  });

  test("E2E NL edit in build app workspace", async () => {
    test.skip(true, "Build App workspace removed");
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
    await page.getByTestId("product-mode-toggle").selectOption("developer");
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
    await page.getByTestId("product-mode-toggle").selectOption("developer");
    await page.getByTestId("activity-cql").click();
    await expect(page.getByText("CQL Workspace")).toBeVisible();
  });
});

test.describe("Degraded mode", () => {
  test("shows problems panel warnings", async ({ page }) => {
    await page.goto("/");
    await openDeveloperBottomPanel(page);
    await expect(page.getByTestId("problems-panel")).toBeVisible();
  });
});

test.describe("Jira sidebar", () => {
  test("finds mock ticket by key and opens editor", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("product-mode-toggle").selectOption("developer");
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
    await page.getByTestId("product-mode-toggle").selectOption("developer");
    await page.getByTestId("activity-jira").click();
    await page.getByTestId("jira-search-submit").click();
    await expect(page.getByTestId("jira-search-error")).toBeVisible();
  });
});

test.describe("MCP sidebar", () => {
  test("shows MCP status note", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("product-mode-toggle").selectOption("developer");
    await page.getByTestId("activity-mcp").click();
    await expect(page.getByTestId("mcp-sidebar")).toBeVisible();
    await expect(page.getByTestId("mcp-sidebar-note")).toBeVisible();
  });
});

test.describe("Client mode professionalism", () => {
  test("home page does not show internal developer labels", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("app-title")).toHaveText("AI Support Studio");
    await expect(page.getByText("AI Support Investigation IDE")).toHaveCount(0);
    await expect(page.getByText(/Cursor-style/i)).toHaveCount(0);
    await expect(page.getByText(/GitHub \(mock\)/i)).toHaveCount(0);
    await expect(page.getByText(/Jira: mock/i)).toHaveCount(0);
    await expect(page.getByText(/RAG: local/i)).toHaveCount(0);
    await expect(page.getByTestId("bottom-tab-terminal")).toHaveCount(0);
    await expect(page.getByText(/Agent Trace/i)).toHaveCount(0);
    await expect(page.getByText(/\/build-app/i)).toHaveCount(0);
    await expect(page.getByText(/NihalCode|nihalcodes/i)).toHaveCount(0);
  });

  test("home page shows professional dashboard copy", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("chat-welcome-hero")).toBeVisible();
    await expect(page.getByText(/Investigate issues and work with Cyware APIs/i)).toBeVisible();
    await expect(page.getByTestId("prompt-card-investigate-api")).toBeVisible();
    await expect(page.getByTestId("prompt-card-endpoint")).toBeVisible();
    await expect(page.getByTestId("prompt-card-cql")).toBeVisible();
  });

  test("client mode shows friendly status and chat", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("status-readiness")).toContainText(/Everything looks ready|issue/i);
    await expect(page.getByTestId("ai-chat-input")).toBeVisible();
    await expect(page.getByTestId("chat-empty-state")).toBeVisible();
    await expect(page.getByTestId("chat-empty-state").getByText(/CTIX indicator search endpoint/i)).toBeVisible();
  });

  test("developer mode reveals advanced panels", async ({ page }) => {
    await page.goto("/");
    await openDeveloperBottomPanel(page);
    await expect(page.getByTestId("bottom-tab-terminal")).toBeVisible();
    await expect(page.getByTestId("open-command-palette")).toBeVisible();
    await page.getByTestId("sidebar-advanced-toggle").click();
    await expect(page.getByTestId("sidebar-advanced-mcp")).toBeVisible();
  });

  test("client mode hides raw build errors until technical details expanded", async () => {
    test.skip(true, "Build App workspace removed");
  });
});

test.describe("Investigations sidebar", () => {
  test("lists saved investigations in test mode", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("product-mode-toggle").selectOption("developer");
    await page.getByTestId("activity-investigations").click();
    await expect(page.getByTestId("investigations-sidebar")).toBeVisible();
    await expect(page.locator('[data-testid^="investigation-"]').first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Settings and integrations", () => {
  test("opens integration registry with configure forms", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("product-mode-toggle").selectOption("developer");
    await page.getByTestId("activity-integrations").click();
    await expect(page.getByTestId("settings-editor")).toBeVisible();
    await expect(page.getByTestId("integration-health-panel")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("integration-settings-panel")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("enterprise-integration-jira")).toBeVisible();
    await page.getByTestId("enterprise-configure-jira").click();
    await expect(page.getByTestId("enterprise-form-jira")).toBeVisible();
    await expect(page.getByTestId("enterprise-field-jira-baseUrl")).toBeVisible();
  });

  test("shows enterprise admin sections in developer mode", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("product-mode-toggle").selectOption("developer");
    await page.getByTestId("activity-settings").click();
    const settings = page.getByTestId("settings-editor");
    await settings.getByTestId("settings-nav-setup").click();
    await expect(settings.getByTestId("setup-checklist-panel")).toBeVisible({ timeout: 10000 });
    await settings.getByTestId("settings-nav-audit").click();
    await expect(settings.getByTestId("audit-logs-panel")).toBeVisible();
    await settings.getByTestId("settings-nav-knowledge").click();
    await expect(settings.getByTestId("knowledge-sources-panel")).toBeVisible();
  });

  test("auth me bootstrap returns session in test mode", async ({ request }) => {
    const res = await request.get("/api/auth/me");
    expect(res.ok()).toBeTruthy();
    const data = (await res.json()) as { user?: { role?: string }; permissions?: string[] };
    expect(data.user?.role).toBeTruthy();
    expect(data.permissions?.length).toBeGreaterThan(0);
  });
});

test.describe("Keyword search", () => {
  test("returns keyword results in test mode", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("product-mode-toggle").selectOption("developer");
    await page.getByTestId("activity-search").click();
    await page.getByTestId("search-mode-keyword").click();
    await page.getByTestId("search-input").fill("PAY-101");
    await page.getByTestId("search-submit").click();
    await expect(page.getByText(/PAY-101|webhook/i).first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Enterprise integrations API", () => {
  test("lists integrations and enterprise status routes", async ({ request }) => {
    for (const path of [
      "/api/integrations",
      "/api/integrations/slack",
      "/api/integrations/confluence",
      "/api/integrations/zendesk",
      "/api/integrations/jira",
    ]) {
      const res = await request.get(path);
      expect(res.ok(), `${path} should succeed in test mode`).toBeTruthy();
    }
  });

  test("zendesk ticket search returns mock results", async ({ request }) => {
    const res = await request.get("/api/integrations/zendesk/tickets?q=sync");
    expect(res.ok()).toBeTruthy();
    const data = (await res.json()) as { tickets?: unknown[] };
    expect(Array.isArray(data.tickets)).toBe(true);
  });

  test("confluence page search returns results", async ({ request }) => {
    const res = await request.get("/api/integrations/confluence/pages?q=runbook");
    expect(res.ok()).toBeTruthy();
    const data = (await res.json()) as { pages?: unknown[] };
    expect(Array.isArray(data.pages)).toBe(true);
  });
});

test.describe("Settings enterprise cards", () => {
  test("shows enterprise integration cards in settings", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("activity-integrations").click();
    await expect(page.getByTestId("enterprise-integration-cards")).toBeVisible();
    await expect(page.getByTestId("enterprise-integration-slack")).toBeVisible();
    await expect(page.getByTestId("enterprise-integration-zendesk")).toBeVisible();
  });

  test("hides Jira configure in client mode", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("activity-integrations").click();
    await expect(page.getByTestId("enterprise-configure-jira")).toHaveCount(0);
  });

  test("shows Jira configure in developer mode", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("product-mode-toggle").selectOption("developer");
    await page.getByTestId("activity-integrations").click();
    await expect(page.getByTestId("enterprise-configure-jira")).toBeVisible();
  });
});

test.describe("API smoke (authenticated test mode)", () => {
  test("core support APIs respond", async ({ request }) => {
    for (const path of [
      "/api/support/health",
      "/api/support/status",
      "/api/support/bootstrap",
      "/api/integrations",
      "/api/support/tickets?ref=PAY-101",
      "/api/support/enterprise/health",
      "/api/support/enterprise/setup",
    ]) {
      const res = await request.get(path);
      expect(res.ok(), `${path} should succeed in test mode`).toBeTruthy();
    }
  });

  test("POST search returns results", async ({ request }) => {
    const res = await request.post("/api/support/search", {
      data: { query: "tag creation 400", mode: "hybrid" },
    });
    expect(res.ok()).toBeTruthy();
    const data = (await res.json()) as { results?: unknown[] };
    expect(Array.isArray(data.results)).toBe(true);
  });
});
