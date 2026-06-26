#!/usr/bin/env node
/**
 * Smoke-test IDE-facing /api/support/* endpoints for response-shape regressions.
 * Usage: node scripts/test-ide-api.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? "http://127.0.0.1:3000";

const checks = [];

async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, ok: true });
    console.log(`✓ ${name}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    checks.push({ name, ok: false, msg });
    console.error(`✗ ${name} — ${msg}`);
  }
}

async function json(path, init) {
  const res = await fetch(`${BASE}${path}`, init);
  const body = await res.json();
  return { res, body };
}

console.log(`\nIDE API smoke test — ${BASE}\n`);

await check("GET /api/support/status → integrations", async () => {
  const { res, body } = await json("/api/support/status");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!body.integrations) throw new Error("missing integrations");
});

await check("GET /api/support/api-import → specs[]", async () => {
  const { res, body } = await json("/api/support/api-import");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!Array.isArray(body.specs)) throw new Error("specs must be array");
});

await check("GET /api/support/mcp → statuses[] + tools[]", async () => {
  const { res, body } = await json("/api/support/mcp");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!Array.isArray(body.statuses)) throw new Error("statuses must be array");
  if (!Array.isArray(body.tools)) throw new Error("tools must be array");
});

await check("GET /api/support/investigations → investigations[]", async () => {
  const { res, body } = await json("/api/support/investigations");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!Array.isArray(body.investigations)) throw new Error("investigations must be array");
});

await check("GET /api/support/tickets?q=indicator → jira.issues[]", async () => {
  const { res, body } = await json("/api/support/tickets?q=indicator");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!body.jira || !Array.isArray(body.jira.issues)) throw new Error("jira.issues must be array");
  if ("tickets" in body) throw new Error("legacy tickets field must not exist");
});

await check("GET /api/support/tickets?ref=PAY-101 → issue", async () => {
  const { res, body } = await json("/api/support/tickets?ref=PAY-101");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!body.issue?.key && !body.issue?.title) throw new Error("issue missing key/title");
});

await check("POST /api/support/search → results[]", async () => {
  const { res, body } = await json("/api/support/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "indicator", mode: "keyword" }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.error ?? ""}`);
  if (!Array.isArray(body.results)) throw new Error("results must be array");
});

await check("GET /api/support/terminal/commands → commands[]", async () => {
  const { res, body } = await json("/api/support/terminal/commands");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!Array.isArray(body.commands)) throw new Error("commands must be array");
});

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} passed\n`);
if (failed.length) process.exit(1);
