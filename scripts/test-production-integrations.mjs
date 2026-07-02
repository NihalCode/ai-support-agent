#!/usr/bin/env node
/**
 * Production integration + feature test (requires Auth0 session).
 *
 * Usage:
 *   AUTH0_E2E_EMAIL=you@example.com AUTH0_E2E_PASSWORD=secret node scripts/test-production-integrations.mjs
 *   node scripts/test-production-integrations.mjs [baseUrl]
 *
 * Loads AUTH0_E2E_* from .env.local when unset.
 */
import { readFileSync, existsSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "https://ai-support-agent-ecru.vercel.app";

function loadEnvLocal() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, k, raw] = m;
    if (process.env[k] == null || process.env[k] === "") {
      process.env[k] = raw.replace(/^["']|["']$/g, "");
    }
  }
}

loadEnvLocal();

const email = process.env.AUTH0_E2E_EMAIL?.trim();
const password = process.env.AUTH0_E2E_PASSWORD?.trim();

if (!email || !password) {
  console.error(
    "Missing AUTH0_E2E_EMAIL / AUTH0_E2E_PASSWORD (set in env or .env.local for production tests)."
  );
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
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  if (page.url().includes("auth0.com")) {
    await page.getByRole("textbox", { name: /email/i }).fill(email);
    await page.getByRole("textbox", { name: /password/i }).fill(password);
    await page.getByRole("button", { name: /^Continue$/i }).click();
    await page.waitForURL((url) => url.hostname.includes("vercel.app"), { timeout: 60000 });
  }
  await page.waitForSelector('[data-testid="ide-root"]', { timeout: 60000 });
}

async function apiJson(request, path, opts = {}) {
  const res = await request.fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 300) };
  }
  return { res, body };
}

console.log(`\nProduction test — ${BASE}\n`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

try {
  await login(page);
  pass("Auth0 login", page.url());

  const me = await apiJson(page.request, "/api/auth/me");
  if (!me.res.ok() || !me.body.authenticated) {
    fail("GET /api/auth/me", JSON.stringify(me.body));
  } else {
    pass("GET /api/auth/me", `role=${me.body.user?.role}`);
  }

  const health = await apiJson(page.request, "/api/support/health");
  if (!health.res.ok()) fail("GET /api/support/health", `HTTP ${health.res.status()}`);
  else {
    const live = health.body.connectors?.filter((c) => c.ok).map((c) => c.name).join(", ");
    pass("GET /api/support/health", live || "no live connectors");
  }

  const status = await apiJson(page.request, "/api/support/status");
  if (!status.res.ok()) fail("GET /api/support/status", `HTTP ${status.res.status()}`);
  else pass("GET /api/support/status", `openai=${status.body.integrations?.openai?.configured}`);

  for (const type of ["slack", "confluence", "zendesk", "jira"]) {
    const st = await apiJson(page.request, `/api/integrations/${type}`);
    if (!st.res.ok()) {
      fail(`GET /api/integrations/${type}`, `HTTP ${st.res.status()}: ${st.body.error ?? ""}`);
      continue;
    }
    const configured = st.body.configured;
    const source = st.body.source;
    pass(`GET /api/integrations/${type}`, `configured=${configured} source=${source}`);

    const test = await apiJson(page.request, `/api/integrations/${type}`, {
      method: "POST",
      data: JSON.stringify({ action: "test" }),
    });
    if (!test.res.ok()) {
      fail(`POST /api/integrations/${type} test`, `HTTP ${test.res.status()}: ${test.body.error ?? test.body.health?.message ?? ""}`);
    } else {
      const ok = test.body.health?.ok;
      pass(`POST /api/integrations/${type} test`, test.body.health?.message ?? String(ok));
    }
  }

  const zendeskSearch = await apiJson(page.request, "/api/integrations/zendesk/tickets?q=test");
  if (!zendeskSearch.res.ok()) fail("GET zendesk/tickets", `HTTP ${zendeskSearch.res.status()}`);
  else pass("GET zendesk/tickets", `${zendeskSearch.body.tickets?.length ?? 0} tickets`);

  const confSearch = await apiJson(page.request, "/api/integrations/confluence/pages?q=runbook");
  if (!confSearch.res.ok()) fail("GET confluence/pages", `HTTP ${confSearch.res.status()}: ${confSearch.body.error ?? ""}`);
  else pass("GET confluence/pages", `${confSearch.body.pages?.length ?? 0} pages`);

  const jiraSearch = await apiJson(page.request, "/api/integrations/jira/issues?q=AISUP");
  if (!jiraSearch.res.ok()) fail("GET jira/issues", `HTTP ${jiraSearch.res.status()}: ${jiraSearch.body.error ?? ""}`);
  else pass("GET jira/issues", `${jiraSearch.body.issues?.length ?? 0} issues`);

  const entHealth = await apiJson(page.request, "/api/support/enterprise/health?developer=true");
  if (!entHealth.res.ok()) fail("GET enterprise/health", `HTTP ${entHealth.res.status()}`);
  else pass("GET enterprise/health", `${entHealth.body.integrations?.length ?? 0} cards`);

  const inv = await apiJson(page.request, "/api/support/investigate", {
    method: "POST",
    data: JSON.stringify({
      query: {
        text: "POST /v3/indicators/search/ returns 500",
        endpoint: "/v3/indicators/search/",
        statusCode: 500,
        issueRef: "AISUP5-1",
      },
    }),
  });
  if (!inv.res.ok() || !inv.body.sessionId) fail("POST investigate", inv.body.error ?? "no session");
  else pass("POST investigate", `session=${inv.body.sessionId.slice(0, 8)}…`);

  const slackChallenge = await page.request.post(`${BASE}/api/slack/events`, {
    headers: { "Content-Type": "application/json" },
    data: JSON.stringify({ type: "url_verification", challenge: "prod-test-challenge" }),
  });
  if (slackChallenge.status() === 401) {
    pass("POST /api/slack/events (unsigned)", "401 as expected without signature");
  } else if (slackChallenge.status() === 200) {
    const body = await slackChallenge.json();
    if (body.challenge === "prod-test-challenge") pass("POST /api/slack/events url_verification", "challenge returned");
    else fail("POST /api/slack/events", JSON.stringify(body));
  } else {
    fail("POST /api/slack/events", `HTTP ${slackChallenge.status()}`);
  }

  await page.getByTestId("activity-settings").click();
  await page.waitForSelector('[data-testid="enterprise-integration-cards"]', { timeout: 15000 });
  pass("UI Settings integrations", "enterprise cards visible");

  await page.getByTestId("product-mode-toggle").selectOption("developer");
  await expectVisible(page, '[data-testid="enterprise-integration-slack"]', "Slack card");
  await expectVisible(page, '[data-testid="enterprise-integration-zendesk"]', "Zendesk card");
  await expectVisible(page, '[data-testid="enterprise-integration-confluence"]', "Confluence card");
  await expectVisible(page, '[data-testid="enterprise-integration-jira"]', "Jira card");
} catch (err) {
  fail("unexpected", err instanceof Error ? err.message : String(err));
} finally {
  await browser.close();
}

async function expectVisible(page, selector, label) {
  try {
    await page.waitForSelector(selector, { timeout: 10000 });
    pass(`UI ${label}`, "visible");
  } catch {
    fail(`UI ${label}`, "not visible");
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  process.exit(1);
}
