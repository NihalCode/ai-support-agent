#!/usr/bin/env node
/**
 * Authenticated production investigate checks for CTIX / CFTR / Orchestrate / CQL scenarios.
 * Requires AUTH0_E2E_EMAIL + AUTH0_E2E_PASSWORD in process env.
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "https://ai-support-agent-ecru.vercel.app";
const email = process.env.AUTH0_E2E_EMAIL?.trim();
const password = process.env.AUTH0_E2E_PASSWORD?.trim();

if (!email || !password) {
  console.error("AUTH0_E2E_EMAIL and AUTH0_E2E_PASSWORD required");
  process.exit(2);
}

const SCENARIOS = [
  {
    name: "CTIX 401",
    query: {
      text: "401 Unauthorized on CTIX Open API since this morning — signature expiry",
      statusCode: 401,
    },
  },
  {
    name: "CFTR incident",
    query: { text: "CFTR POST create incident returns 401 since this morning", statusCode: 401 },
  },
  {
    name: "Orchestrate playbook",
    query: { text: "Orchestrate playbook timed out — need run logs and node results" },
  },
  {
    name: "CQL malicious IP",
    query: { text: "CQL query malicious IP indicators last 24h confidence 90" },
  },
];

const results = [];

async function login(page) {
  await page.goto(`${BASE}/auth/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForURL(/auth0\.com/i, { timeout: 45000 });
  await page.getByRole("textbox", { name: /email/i }).fill(email);
  await page.getByRole("textbox", { name: /password/i }).fill(password);
  await page.getByRole("button", { name: /^Continue$/i }).click();
  await page.waitForURL(/vercel\.app/i, { timeout: 90000 });
}

console.log(`\nProduction investigate products — ${BASE}\n`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
try {
  await login(page);
  for (const s of SCENARIOS) {
    try {
      const res = await page.request.post(`${BASE}/api/support/investigate`, {
        data: { query: s.query },
        timeout: 120_000,
      });
      const body = await res.json();
      if (!res.ok()) throw new Error(body.error ?? `HTTP ${res.status()}`);
      const md = body.markdownReport ?? "";
      const hasDocLinks =
        /Relevant documentation/i.test(md) ||
        (body.context?.docs?.docs ?? []).some((d) => d.url?.startsWith("http"));
      if (!body.sessionId) throw new Error("no sessionId");
      if (!hasDocLinks && s.name !== "CQL malicious IP") {
        throw new Error("missing doc links in report");
      }
      results.push({ name: s.name, ok: true, detail: body.sessionId });
      console.log(`✓ ${s.name} — ${body.sessionId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ name: s.name, ok: false, detail: msg });
      console.error(`✗ ${s.name} — ${msg}`);
    }
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} product investigate checks passed`);
if (failed.length) process.exit(1);
