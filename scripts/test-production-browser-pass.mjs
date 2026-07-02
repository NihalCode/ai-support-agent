#!/usr/bin/env node
/**
 * Focused production browser QA: Support vs Developer mode, Build App, approval gates.
 *
 * Usage:
 *   AUTH0_E2E_EMAIL=... AUTH0_E2E_PASSWORD=... node scripts/test-production-browser-pass.mjs [baseUrl]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "https://ai-support-agent-ecru.vercel.app";
const email = process.env.AUTH0_E2E_EMAIL?.trim();
const password = process.env.AUTH0_E2E_PASSWORD?.trim();

if (!email || !password) {
  console.error("Missing AUTH0_E2E_EMAIL / AUTH0_E2E_PASSWORD");
  process.exit(2);
}

const FORBIDDEN = [
  /AI Support Investigation IDE/i,
  /Cursor-style/i,
  /GitHub \(mock\)/i,
  /Jira: mock/i,
  /RAG: local/i,
  /Agent Trace/i,
  /\/build-app/i,
  /NihalCode|nihalcodes/i,
  /next: command not found/i,
  /localhost/i,
];

const results = [];

function pass(name, detail) {
  results.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.error(`✗ ${name} — ${detail}`);
}

async function login(page) {
  await page.goto(`${BASE}/auth/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForURL(/auth0\.com/i, { timeout: 45000 });
  await page.getByRole("textbox", { name: /email/i }).fill(email);
  await page.getByRole("textbox", { name: /password/i }).fill(password);
  await page.getByRole("button", { name: /^Continue$/i }).click();
  await page.waitForURL(/vercel\.app/i, { timeout: 90000 });
  await page.waitForSelector('[data-testid="ide-root"]', { timeout: 60000 });
}

async function setMode(page, mode) {
  await page.getByTestId("activity-settings").click();
  await page.waitForSelector('[data-testid="settings-mode-select"]', { timeout: 15000 });
  await page.getByTestId("settings-mode-select").selectOption(mode);
  if (mode === "client") {
    await page.getByTestId("activity-home").click();
  }
}

async function countVisible(page, testId) {
  return page.getByTestId(testId).count();
}

console.log(`\nProduction browser pass — ${BASE}\n`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

try {
  await login(page);
  pass("Auth0 login", page.url());

  // Default should be Support Mode for owner? Check - may need to set client explicitly
  await setMode(page, "client");
  pass("Support Mode selected", "via settings");

  await page.getByTestId("activity-home").click();
  const title = await page.getByTestId("app-title").textContent();
  if (title?.includes("AI Support Studio")) pass("App title professional", title.trim());
  else fail("App title professional", title ?? "missing");

  let forbiddenHit = null;
  for (const re of FORBIDDEN) {
    const n = await page.getByText(re).count();
    if (n > 0) {
      forbiddenHit = re.toString();
      break;
    }
  }
  if (!forbiddenHit) pass("Support Mode forbidden text", "none visible");
  else fail("Support Mode forbidden text", forbiddenHit);

  if ((await countVisible(page, "bottom-tab-terminal")) === 0) pass("Support hides terminal tab");
  else fail("Support hides terminal tab", "terminal tab visible");

  if ((await countVisible(page, "activity-mcp")) === 0) pass("Support hides MCP activity");
  else fail("Support hides MCP activity", "MCP visible");

  if ((await countVisible(page, "activity-build-app")) > 0) pass("Support shows Build activity");
  else fail("Support shows Build activity", "missing");

  if (await page.getByTestId("home-dashboard").isVisible()) pass("Home dashboard visible");
  else fail("Home dashboard visible", "not found");

  // Developer mode
  await setMode(page, "developer");
  pass("Developer Mode selected");

  await page.getByTestId("activity-home").click();
  if ((await countVisible(page, "bottom-tab-terminal")) > 0) pass("Developer shows terminal tab");
  else fail("Developer shows terminal tab", "hidden");

  if ((await countVisible(page, "activity-mcp")) > 0) pass("Developer shows MCP activity");
  else fail("Developer shows MCP activity", "hidden");

  if ((await countVisible(page, "open-command-palette")) > 0) pass("Developer shows command palette");
  else fail("Developer shows command palette", "hidden");

  await page.getByTestId("activity-settings").click();
  await page.waitForSelector('[data-testid="enterprise-integration-jira"]', { timeout: 15000 });
  if (await page.getByTestId("enterprise-configure-jira").isVisible()) {
    pass("Developer Mode shows Jira configure");
  } else {
    fail("Developer Mode shows Jira configure", "button hidden");
  }

  // Support mode hides custom Jira setup
  await setMode(page, "client");
  await page.getByTestId("activity-settings").click();
  await page.waitForSelector('[data-testid="enterprise-integration-cards"]', { timeout: 15000 });
  const jiraConfigure = await page.getByTestId("enterprise-configure-jira").count();
  if (jiraConfigure === 0) pass("Support Mode hides Jira configure");
  else fail("Support Mode hides Jira configure", "configure button visible");

  // Build App scaffold + approval gate (no deploy)
  await page.getByTestId("activity-build-app").click();
  await page.waitForSelector('[data-testid="build-app-workspace"]', { timeout: 15000 });
  pass("Build App workspace opens");

  const scaffoldMsg =
    "Build me a simple indicator search page with a search box and results table for IPs and domains.";
  await page.getByTestId("build-app-chat-input").fill(scaffoldMsg);
  await page.getByTestId("build-app-chat-send").click();

  try {
    await page.waitForSelector('[data-testid="build-app-approve"]', { timeout: 45000 });
    pass("Build App approval gate appears", "before scaffold apply");
  } catch {
    fail("Build App approval gate appears", "approve button not shown in 45s");
  }

  const buildBeforeApprove = await page.getByTestId("build-app-build").count();
  if (buildBeforeApprove === 0) pass("Build blocked before approval");
  else fail("Build blocked before approval", "build button visible pre-approval");

  const approveLabel = await page.getByTestId("build-app-approve").textContent();
  if (approveLabel && /approve|apply|create my app/i.test(approveLabel)) {
    pass("Approval button labeled correctly", approveLabel.trim().slice(0, 40));
  } else {
    fail("Approval button labeled correctly", approveLabel ?? "empty");
  }

  await page.getByTestId("build-app-approve").click();

  try {
    await page.waitForSelector('[data-testid="build-app-build"]', { timeout: 30000 });
    pass("Build action unlocked after approval");
  } catch {
    fail("Build action unlocked after approval", "build button missing after approve");
  }

  // Pending edit preserves state
  await page.getByTestId("build-app-chat-input").fill("make the UI cleaner with less text on the landing page");
  await page.getByTestId("build-app-chat-send").click();

  try {
    await page.waitForFunction(
      () => {
        const nodes = document.querySelectorAll('[data-testid="build-app-chat-assistant"]');
        return nodes.length >= 2;
      },
      { timeout: 45000 }
    );
    const lastAssistant = page.getByTestId("build-app-chat-assistant").last();
    const text = (await lastAssistant.textContent()) ?? "";
    if (/describe the app you want|what would you like built/i.test(text)) {
      fail("Pending scaffold edit", "fell back to generic prompt");
    } else {
      pass("Pending scaffold edit", "no generic fallback");
    }
  } catch {
    fail("Pending scaffold edit", "assistant did not respond");
  }

  // Approvals API reachable
  const approvalsRes = await page.request.get(`${BASE}/api/support/approvals`);
  if (approvalsRes.ok()) {
    const body = await approvalsRes.json();
    pass("GET /api/support/approvals", `${body.approvals?.length ?? 0} items`);
  } else {
    fail("GET /api/support/approvals", `HTTP ${approvalsRes.status()}`);
  }

  // Main chat Build App routing (developer mode — chat panel always used in E2E)
  await page.getByTestId("product-mode-toggle").selectOption("developer");
  await page.getByTestId("activity-home").click();
  if ((await page.getByTestId("ai-chat-input").count()) === 0) {
    await page.getByRole("button", { name: "Assistant" }).click();
  }
  await page.waitForSelector('[data-testid="ai-chat-input"]', { state: "visible", timeout: 15000 });
  const nlMsg = "I need a small internal tool where analysts can search indicators and click into details.";
  await page.getByTestId("ai-chat-input").fill(nlMsg);
  await page.getByTestId("ai-chat-input").press("Enter");

  try {
    await page.waitForSelector('[data-testid="build-app-workspace"]', { timeout: 60000 });
    pass("Main chat routes to Build App", "workspace opened");
  } catch {
    fail("Main chat routes to Build App", "workspace not opened in 60s");
  }
} catch (err) {
  fail("unexpected", err instanceof Error ? err.message : String(err));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  process.exit(1);
}
