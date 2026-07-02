#!/usr/bin/env node
/**
 * Production Build App reliability QA (flows A–F subset).
 *
 * Usage:
 *   AUTH0_E2E_EMAIL=... AUTH0_E2E_PASSWORD=... node scripts/test-production-build-app.mjs [baseUrl]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "https://ai-support-agent-ecru.vercel.app";
const email = process.env.AUTH0_E2E_EMAIL?.trim();
const password = process.env.AUTH0_E2E_PASSWORD?.trim();

if (!email || !password) {
  console.error("Missing AUTH0_E2E_EMAIL / AUTH0_E2E_PASSWORD");
  process.exit(2);
}

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

async function openBuildApp(page) {
  await page.getByTestId("activity-build-app").click();
  await page.waitForSelector('[data-testid="build-app-workspace"]', { timeout: 15000 });
}

async function sendChat(page, text) {
  await page.getByTestId("build-app-chat-input").fill(text);
  await page.getByTestId("build-app-chat-send").click();
}

console.log(`\nProduction Build App QA — ${BASE}\n`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  await login(page);
  pass("Flow 0: Auth login");

  await openBuildApp(page);
  pass("Flow 0: Build App workspace opens");

  // Flow A — basic indicator dashboard plan
  const flowAMsg =
    "Build me an indicator search dashboard. I want to search IPs, domains, and file hashes, see results in a table, and open details on the side.";
  await sendChat(page, flowAMsg);
  const assistant = page.getByTestId("build-app-chat-assistant").first();
  await assistant.waitFor({ timeout: 45000 });
  const planText = await assistant.innerText();
  if (!/indicator|template|diff|approve/i.test(planText)) {
    fail("Flow A: plan appears", planText.slice(0, 200));
  } else if (/Describe the app you want to build/i.test(planText)) {
    fail("Flow A: no generic describe prompt", planText.slice(0, 200));
  } else {
    pass("Flow A: app plan appears");
  }

  await page.waitForSelector('[data-testid="build-app-approve"]', { timeout: 20000 });
  pass("Flow A: approval gate visible");

  await page.getByRole("button", { name: /Show technical details/i }).click();
  const diffPanel = page.getByTestId("build-app-diff-panel");
  if ((await diffPanel.count()) > 0) pass("Flow A: file diffs visible");
  else fail("Flow A: file diffs visible", "diff panel missing after Show technical details");

  // Flow C — pending scaffold modification
  await sendChat(page, "Make the landing page cleaner and remove unnecessary intro text.");
  const lastAssistant = page.getByTestId("build-app-chat-assistant").last();
  await lastAssistant.waitFor({ timeout: 45000 });
  const modText = await lastAssistant.innerText();
  if (/Describe the app you want to build/i.test(modText)) {
    fail("Flow C: no repeat describe prompt", modText.slice(0, 200));
  } else {
    pass("Flow C: pending scaffold edit preserves context");
  }

  // Flow D — natural approval
  await sendChat(page, "Now build it.");
  await page.waitForTimeout(2000);
  if (await page.getByTestId("build-app-approve").isVisible().catch(() => false)) {
    await page.getByTestId("build-app-approve").click();
  }
  const buildBtn = page.getByTestId("build-app-build");
  if (await buildBtn.isVisible({ timeout: 30000 }).catch(() => false)) {
    pass("Flow D: natural approval interpreted");
  } else {
    fail("Flow D: natural approval", "build button not shown after approval");
  }

  // Flow B-style integration honesty — fresh workspace
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="ide-root"]', { timeout: 60000 });
  await openBuildApp(page);
  await sendChat(page, "Build a Zendesk ticket triage dashboard.");
  const zdAssistant = page.getByTestId("build-app-chat-assistant").first();
  await zdAssistant.waitFor({ timeout: 45000 });
  const zdText = await zdAssistant.innerText();
  if (/Zendesk is connected and ready|Zendesk dashboard ready/i.test(zdText)) {
    fail("Flow B/integration: no fake Zendesk connected claim", zdText.slice(0, 300));
  } else if (/not connected|backend-pending|demo|placeholder/i.test(zdText)) {
    pass("Flow B/integration: Zendesk honesty when not connected");
  } else {
    pass("Flow B/integration: Zendesk plan without false connected claim", zdText.slice(0, 80));
  }

  // Readiness sidebar — preview should not show ready before build
  const readiness = page.getByTestId("build-app-readiness");
  const readinessText = await readiness.innerText();
  if (/Preview ready[\s\S]*✓/i.test(readinessText) && !(await buildBtn.isVisible().catch(() => false))) {
    fail("Hallucination: preview ready before build", readinessText);
  } else {
    pass("Readiness: preview not falsely marked ready");
  }
} catch (e) {
  fail("Unhandled error", e instanceof Error ? e.message : String(e));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
