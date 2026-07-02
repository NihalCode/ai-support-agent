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
  test("loads client IDE with activity bar and home dashboard", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("ide-root")).toBeVisible();
    await expect(page.getByTestId("activity-bar")).toBeVisible();
    await expect(page.getByTestId("home-dashboard")).toBeVisible();
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

  test("developer mode shows bottom panel", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("product-mode-toggle").selectOption("developer");
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
    await page.getByTestId("product-mode-toggle").selectOption("developer");
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
    await page.getByTestId("product-mode-toggle").selectOption("developer");
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
    await page.getByTestId("product-mode-toggle").selectOption("developer");
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
      /Build App|indicator search|template/i,
      { timeout: 20000 }
    );
    await expect(page.getByText(/open_build_app|appBuilder/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("build-app-workspace")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("build-app-input")).toHaveValue(msg, { timeout: 5000 });
    await expect(page.getByTestId("build-app-chat-input")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("build-app-chat-assistant").first()).toContainText(/indicator|template|Build App/i, {
      timeout: 20000,
    });
  });
});

test.describe("Build App workspace", () => {
  test("generates scaffold plan and approves in test mode", async ({ page }) => {
    test.setTimeout(90000);
    await page.goto("/");
    await page.getByTestId("activity-build-app").click();
    await expect(page.getByTestId("build-app-workspace")).toBeVisible({ timeout: 10000 });
    const msg =
      "Build me a simple indicator search dashboard using Cyware APIs. Search box, optional CQL filter, table results, and details panel. Prepare for Vercel deployment.";
    await page.getByTestId("build-app-chat-input").fill(msg);
    await page.getByTestId("build-app-chat-send").click();
    await expect(page.getByTestId("build-app-chat-assistant").first()).toContainText(/indicator-search-dashboard|indicator search|template/i, {
      timeout: 15000,
    });
    await expect(page.getByTestId("build-app-approve")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("build-app-approve").click();
    await expect(page.getByTestId("build-app-build")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("build-app-build").click();
    await expect(page.getByTestId("build-app-workflow-state")).toContainText(/Build passed|Preview ready|Build checked/i, {
      timeout: 15000,
    });
    await expect(page.getByTestId("build-app-deploy-preview")).toBeVisible({ timeout: 5000 });
    await page.getByTestId("build-app-deploy-preview").click();
    await page.getByRole("button", { name: "Show technical details" }).click();
    await expect(page.getByTestId("build-app-preview-url")).toContainText(/vercel\.app/i, {
      timeout: 20000,
    });
  });

  test("shows build failure and hides preview when build fails", async ({ page }) => {
    test.setTimeout(90000);
    await page.route("**/api/support/build-app", async (route, request) => {
      if (request.method() === "POST") {
        const body = request.postDataJSON() as { action?: string };
        if (body.action === "build") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              ok: false,
              buildOk: false,
              preflightOk: true,
              output: "sh: line 1: next: command not found\nCommand failed: npm run build",
              classification: {
                kind: "missing_command",
                summary: "The Next.js CLI is not installed in the generated app.",
                suggestedFix: "Run npm install in the generated app folder.",
              },
              project: { id: "test", status: "failed", buildOk: false },
            }),
          });
          return;
        }
      }
      await route.continue();
    });
    await page.goto("/");
    await page.getByTestId("activity-build-app").click();
    await expect(page.getByTestId("build-app-workspace")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("build-app-chat-input").fill("Build indicator search dashboard");
    await page.getByTestId("build-app-chat-send").click();
    await expect(page.getByTestId("build-app-approve")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("build-app-approve").click();
    await page.getByTestId("build-app-build").click();
    await expect(page.getByTestId("build-app-workflow-state")).toContainText(/Build failed|fix build/i, {
      timeout: 15000,
    });
    await expect(page.getByTestId("build-app-deploy-preview")).toHaveCount(0);
    await expect(
      page.getByTestId("build-app-workspace").getByText(/Next\.js CLI is not installed|build check failed|required dependency/i).first()
    ).toBeVisible();
    await expect(page.getByTestId("build-app-output")).toBeHidden();
    await page.getByRole("button", { name: "Show technical details" }).click();
    await expect(page.getByTestId("build-app-output")).toBeVisible();
    await expect(page.getByTestId("build-app-output")).toContainText(/next: command not found/i);
  });

  test("edit after scaffold: no raw prompt, make it cleaner runs edit pipeline", async ({ page }) => {
    test.setTimeout(120000);
    const scaffoldMsg =
      "Build me an indicator search dashboard. I want a simple page where I can type in an indicator or CQL query, search, see a table, and open details.";
    await page.goto("/");
    await page.getByTestId("activity-build-app").click();
    await expect(page.getByTestId("build-app-workspace")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("build-app-chat-input").fill(scaffoldMsg);
    await page.getByTestId("build-app-chat-send").click();
    await expect(page.getByTestId("build-app-approve")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("build-app-approve").click();
    await expect(page.getByTestId("build-app-build")).toBeVisible({ timeout: 15000 });

    // Scaffolded page must not contain raw prompt in explanation/diff
    await page.getByRole("button", { name: "Show technical details" }).click();
    const diffPanel = page.getByTestId("build-app-diff-panel");
    await expect(diffPanel).toBeVisible({ timeout: 5000 });
    await expect(diffPanel).not.toContainText(/Build me an indicator search dashboard\. I want a simple page/i);

    await page.getByTestId("build-app-chat-input").fill("make it cleaner");
    await page.getByTestId("build-app-chat-send").click();
    await expect(page.getByTestId("build-app-chat-assistant").first()).not.toContainText(
      /Tell me what you'd like changed/i,
      { timeout: 15000 }
    );
    await expect(page.getByTestId("build-app-approve")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("build-app-approve")).toContainText(/Apply changes/i);
    await page.getByTestId("build-app-approve").click();
    await expect(page.getByTestId("build-app-chat-assistant").last()).toContainText(/Build passed|Changes applied|test build/i, {
      timeout: 30000,
    });
  });

  test("E2E pending scaffold edit does not show describe fallback", async ({ page }) => {
    test.setTimeout(90000);
    await page.goto("/");
    await page.getByTestId("activity-build-app").click();
    await expect(page.getByTestId("build-app-workspace")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("build-app-chat-input").fill("Build indicator search dashboard with search and table");
    await page.getByTestId("build-app-chat-send").click();
    await expect(page.getByTestId("build-app-approve")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("build-app-chat-input").fill(
      "make the UI cleaner, the landing page should not have any unnecessary text"
    );
    await page.getByTestId("build-app-chat-send").click();
    await expect(page.getByTestId("build-app-chat-assistant").last()).not.toContainText(
      /Describe the app you want to build/i,
      { timeout: 15000 }
    );
    await expect(page.getByTestId("build-app-approve")).toBeVisible({ timeout: 10000 });
  });

  test('E2E "Now build the app" approves and runs build', async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/");
    await page.getByTestId("activity-build-app").click();
    await expect(page.getByTestId("build-app-workspace")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("build-app-chat-input").fill("Build indicator search dashboard");
    await page.getByTestId("build-app-chat-send").click();
    await expect(page.getByTestId("build-app-approve")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("build-app-chat-input").fill("Now build the app");
    await page.getByTestId("build-app-chat-send").click();
    await expect(page.getByTestId("build-app-build")).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId("build-app-workflow-state")).toContainText(/Build passed|Build checked|Preview ready/i, {
      timeout: 45000,
    });
  });

  test("E2E generated scaffold has no raw prompt in pending diff", async ({ page }) => {
    test.setTimeout(90000);
    const scaffoldMsg =
      "Build me an indicator search dashboard. I want a simple page where I can type in an indicator or CQL query, search, see a table, and open details.";
    await page.goto("/");
    await page.getByTestId("activity-build-app").click();
    await page.getByTestId("build-app-chat-input").fill(scaffoldMsg);
    await page.getByTestId("build-app-chat-send").click();
    await expect(page.getByTestId("build-app-approve")).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Show technical details" }).click();
    const diffPanel = page.getByTestId("build-app-diff-panel");
    await expect(diffPanel).toBeVisible({ timeout: 5000 });
    await expect(diffPanel).not.toContainText(/Build me an indicator search dashboard\. I want a simple page/i);
  });

  test('E2E edit after scaffold: "make it client-ready"', async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/");
    await page.getByTestId("activity-build-app").click();
    await page.getByTestId("build-app-chat-input").fill("Build indicator search dashboard");
    await page.getByTestId("build-app-chat-send").click();
    await expect(page.getByTestId("build-app-approve")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("build-app-approve").click();
    await expect(page.getByTestId("build-app-build")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("build-app-chat-input").fill("make it client-ready");
    await page.getByTestId("build-app-chat-send").click();
    await expect(page.getByTestId("build-app-chat-assistant").last()).not.toContainText(
      /Describe the app you want to build/i,
      { timeout: 15000 }
    );
    await expect(page.getByTestId("build-app-approve")).toBeVisible({ timeout: 15000 });
  });

  test("E2E build failure shows client-friendly error without fake success", async ({ page }) => {
    test.setTimeout(90000);
    await page.route("**/api/support/build-app", async (route, request) => {
      if (request.method() === "POST") {
        const body = request.postDataJSON() as { action?: string };
        if (body.action === "build") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              ok: false,
              buildOk: false,
              preflightOk: true,
              output: "sh: line 1: next: command not found",
              classification: {
                kind: "missing_command",
                summary: "The build check failed because a required dependency is missing.",
              },
              project: { id: "test", status: "failed", buildOk: false },
            }),
          });
          return;
        }
      }
      await route.continue();
    });
    await page.goto("/");
    await page.getByTestId("activity-build-app").click();
    await page.getByTestId("build-app-chat-input").fill("Build indicator dashboard");
    await page.getByTestId("build-app-chat-send").click();
    await expect(page.getByTestId("build-app-approve")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("build-app-approve").click();
    await page.getByTestId("build-app-build").click();
    await expect(page.getByTestId("build-app-workflow-state")).toContainText(/Build failed|fix build/i, {
      timeout: 15000,
    });
    await expect(page.getByTestId("build-app-deploy-preview")).toHaveCount(0);
    await expect(
      page.getByTestId("build-app-workspace").getByText(/required dependency is missing|build check failed/i).first()
    ).toBeVisible();
  });
});

test.describe("Natural-language agent routing", () => {
  test("E2E NL build app from main chat", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/");
    const msg =
      "I need a small internal tool where analysts can search indicators and click into details.";
    await page.getByTestId("ai-chat-input").fill(msg);
    await page.getByTestId("ai-chat-input").press("Enter");
    await expect(page.getByTestId("chat-assistant-message")).toContainText(/Understood as: build app|Build App|template/i, {
      timeout: 20000,
    });
    await expect(page.getByTestId("build-app-workspace")).toBeVisible({ timeout: 15000 });
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

  test("E2E NL edit in build app workspace", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/");
    await page.getByTestId("activity-build-app").click();
    await expect(page.getByTestId("build-app-workspace")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("build-app-chat-input").fill(
      "I need a dashboard where analysts can search indicators and open details."
    );
    await page.getByTestId("build-app-chat-send").click();
    await expect(page.getByTestId("build-app-approve")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("build-app-approve").click();
    await page.getByTestId("build-app-chat-input").fill(
      "This looks too much like a demo. Make it client-ready."
    );
    await page.getByTestId("build-app-chat-send").click();
    await expect(page.getByTestId("build-app-chat-assistant").last()).not.toContainText(
      /Tell me what you'd like changed/i,
      { timeout: 15000 }
    );
    await expect(page.getByTestId("build-app-approve")).toBeVisible({ timeout: 15000 });
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
    await page.getByTestId("product-mode-toggle").selectOption("developer");
    await page.getByTestId("bottom-tab-problems").click();
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
    await expect(page.getByTestId("home-dashboard")).toBeVisible();
    await expect(page.getByText(/Describe what you want to build, fix, investigate, or deploy/i)).toBeVisible();
    await expect(page.getByTestId("home-card-build")).toBeVisible();
    await expect(page.getByTestId("home-card-investigate")).toBeVisible();
    await expect(page.getByTestId("home-card-apis")).toBeVisible();
    await expect(page.getByTestId("home-card-deploy")).toBeVisible();
    await expect(page.getByText("Start building")).toBeVisible();
    await expect(page.getByText("Start investigation")).toBeVisible();
  });

  test("client mode shows friendly status and chat", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("status-readiness")).toContainText(/Everything looks ready|issue/i);
    await expect(page.getByTestId("ai-chat-input")).toBeVisible();
    await expect(page.getByTestId("chat-empty-state")).toBeVisible();
    await expect(page.getByTestId("chat-empty-state").getByText(/Build an indicator dashboard/i)).toBeVisible();
  });

  test("developer mode reveals advanced panels", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("product-mode-toggle").selectOption("developer");
    await expect(page.getByTestId("bottom-tab-terminal")).toBeVisible();
    await expect(page.getByTestId("open-command-palette")).toBeVisible();
    await expect(page.getByTestId("activity-mcp")).toBeVisible();
  });

  test("client mode hides raw build errors until technical details expanded", async ({ page }) => {
    test.setTimeout(60000);
    await page.route("**/api/support/build-app", async (route, request) => {
      if (request.method() === "POST") {
        const body = request.postDataJSON() as { action?: string };
        if (body.action === "build") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              ok: false,
              buildOk: false,
              output: "sh: line 1: next: command not found",
              classification: {
                kind: "missing_command",
                summary: "The build check failed because a required dependency is missing.",
                suggestedFix: "I can update the project setup and run the check again.",
              },
              project: { id: "test", status: "failed", buildOk: false },
            }),
          });
          return;
        }
      }
      await route.continue();
    });
    await page.goto("/");
    await page.getByTestId("activity-build-app").click();
    await expect(page.getByTestId("build-app-workspace")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("build-app-chat-input").fill("Build indicator dashboard");
    await page.getByTestId("build-app-chat-send").click();
    await expect(page.getByTestId("build-app-approve")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("build-app-approve").click();
    await page.getByTestId("build-app-build").click();
    await expect(
      page.getByTestId("build-app-workspace").getByText(/required dependency is missing|build check failed/i).first()
    ).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(/next: command not found/i)).toBeHidden();
    await page.getByRole("button", { name: "Show technical details" }).click();
    await expect(page.getByTestId("build-app-output")).toBeVisible();
    await expect(page.getByTestId("build-app-output")).toContainText(/next: command not found/i);
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
    await page.getByTestId("activity-settings").click();
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
    await page.getByTestId("activity-settings").click();
    await expect(page.getByTestId("enterprise-integration-cards")).toBeVisible();
    await expect(page.getByTestId("enterprise-integration-slack")).toBeVisible();
    await expect(page.getByTestId("enterprise-integration-jira")).toBeVisible();
  });

  test("hides Jira configure in client mode", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("activity-settings").click();
    await expect(page.getByTestId("enterprise-configure-jira")).toHaveCount(0);
  });

  test("shows Jira configure in developer mode", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("product-mode-toggle").selectOption("developer");
    await page.getByTestId("activity-settings").click();
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
