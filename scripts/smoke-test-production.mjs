#!/usr/bin/env node
/**
 * Production smoke test for ai-support-agent.
 *
 * Phase 1 (always): unauthenticated sanity — login page, auth redirect, protected APIs return 401.
 * Phase 2 (optional): authenticated API workflow when AUTH0_E2E_EMAIL + AUTH0_E2E_PASSWORD are set.
 *
 * Usage:
 *   node scripts/smoke-test-production.mjs [baseUrl]
 *   AUTH0_E2E_EMAIL=you@example.com AUTH0_E2E_PASSWORD=secret node scripts/smoke-test-production.mjs
 */
const BASE = process.argv[2] ?? "https://ai-support-agent-ecru.vercel.app";

const email = process.env.AUTH0_E2E_EMAIL?.trim();
const password = process.env.AUTH0_E2E_PASSWORD?.trim();
const runAuthenticated = Boolean(email && password);

const results = [];

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ name, ok: false, detail: msg });
    console.error(`✗ ${name} — ${msg}`);
  }
}

async function json(path, opts = {}) {
  const allowError = opts.allowError ?? false;
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  if (!res.ok && !allowError) {
    throw new Error(`HTTP ${res.status}: ${body.error ?? text.slice(0, 120)}`);
  }
  return { res, body };
}

console.log(`\nSmoke testing ${BASE}\n`);
console.log("Phase 1 — unauthenticated sanity\n");

await check("GET /login", async () => {
  const res = await fetch(`${BASE}/login`, { redirect: "manual" });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  return "login page reachable";
});

await check("GET / redirects to login", async () => {
  const res = await fetch(`${BASE}/`, { redirect: "manual" });
  const loc = res.headers.get("location") ?? "";
  if (res.status !== 307 && res.status !== 302) throw new Error(`HTTP ${res.status}`);
  if (!loc.includes("/auth/login") && !loc.includes("/login")) {
    throw new Error(`unexpected redirect: ${loc}`);
  }
  return loc;
});

await check("GET /api/auth/me (anonymous)", async () => {
  const { res, body } = await json("/api/auth/me", { allowError: true });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  if (body.authenticated !== false) throw new Error("expected authenticated=false");
  return `authConfigured=${body.authConfigured}`;
});

await check("GET /api/support/health (protected)", async () => {
  const { res, body } = await json("/api/support/health", { allowError: true });
  if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
  if (body.error !== "Unauthorized") throw new Error(`unexpected body: ${JSON.stringify(body)}`);
  return "401 Unauthorized";
});

await check("POST /api/support/investigate (protected)", async () => {
  const { res } = await json("/api/support/investigate", {
    method: "POST",
    allowError: true,
    body: JSON.stringify({ query: { text: "API not working" } }),
  });
  if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
  return "401 Unauthorized";
});

await check("POST /api/slack/events (unsigned)", async () => {
  const res = await fetch(`${BASE}/api/slack/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "url_verification", challenge: "smoke-challenge" }),
  });
  if (res.status === 401) return "401 without signature";
  if (res.status === 200) {
    const body = await res.json();
    if (body.challenge === "smoke-challenge") return "url_verification challenge returned";
  }
  throw new Error(`HTTP ${res.status}`);
});

if (!runAuthenticated) {
  console.log(
    "\nPhase 2 skipped — set AUTH0_E2E_EMAIL and AUTH0_E2E_PASSWORD for authenticated API smoke.\n"
  );
} else {
  console.log("\nPhase 2 — authenticated API smoke\n");
  const { chromium } = await import("playwright");

  let sessionId;

  async function authJson(request, path, opts = {}) {
    const res = await request.fetch(`${BASE}${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 200) };
    }
    if (!res.ok() && !opts.allowError) {
      throw new Error(`HTTP ${res.status()}: ${body.error ?? text.slice(0, 120)}`);
    }
    return { res, body };
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await check("Auth0 login", async () => {
      await page.goto(`${BASE}/auth/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForURL(/auth0\.com/i, { timeout: 45000 });
      await page.getByRole("textbox", { name: /email/i }).fill(email);
      await page.getByRole("textbox", { name: /password/i }).fill(password);
      await page.getByRole("button", { name: /^Continue$/i }).click();
      await page.waitForURL(/vercel\.app/i, { timeout: 90000 });
      await page.waitForSelector('[data-testid="ide-root"]', { timeout: 60000 });
      return page.url();
    });

    const req = page.request;

    await check("GET /api/auth/me (authenticated)", async () => {
      const { res, body } = await authJson(req, "/api/auth/me");
      if (!res.ok() || !body.authenticated) throw new Error(JSON.stringify(body));
      return `role=${body.user?.role ?? "unknown"}`;
    });

    await check("GET /api/support/health", async () => {
      const { body } = await authJson(req, "/api/support/health");
      const live = body.connectors?.filter((c) => c.ok).map((c) => c.name).join(", ");
      if (!body.connectors?.length) throw new Error("no connectors");
      return `live: ${live}`;
    });

    await check("GET /api/support/status", async () => {
      const { body } = await authJson(req, "/api/support/status");
      if (!body.integrations?.openai?.configured) throw new Error("openai not configured");
      return `repo=${body.mode?.repo} sessions=${body.mode?.sessions}`;
    });

    await check("POST /api/support/investigate (vague)", async () => {
      const { body } = await authJson(req, "/api/support/investigate", {
        method: "POST",
        data: JSON.stringify({ query: { text: "API not working" } }),
      });
      if (!body.needsMoreInfo) throw new Error("expected needsMoreInfo");
      return `${body.missingQuestions?.length} questions`;
    });

    await check("POST /api/support/investigate (full)", async () => {
      const { body } = await authJson(req, "/api/support/investigate", {
        method: "POST",
        data: JSON.stringify({
          query: {
            text: "POST /v3/indicators/search/ returns 500 since 10:30 AM",
            endpoint: "/v3/indicators/search/",
            statusCode: 500,
            issueRef: "AISUP5-1",
            repoUrl: "NihalCode/ai-support-agent",
          },
        }),
      });
      if (!body.sessionId || !body.report) throw new Error("missing session/report");
      sessionId = body.sessionId;
      return `status=${body.report.currentStatus}`;
    });

    await check("GET /api/support/investigate?sessionId= (after create)", async () => {
      if (!sessionId) throw new Error("no session");
      const { body } = await authJson(req, `/api/support/investigate?sessionId=${encodeURIComponent(sessionId)}`);
      if (!body.context?.sessionId) throw new Error("session not persisted");
      return "persisted";
    });

    await check("POST /api/support/investigate (chat)", async () => {
      if (!sessionId) throw new Error("no session");
      const { body } = await authJson(req, "/api/support/investigate", {
        method: "POST",
        data: JSON.stringify({ sessionId, message: "Is this a known Jira issue?" }),
      });
      if (!body.chatReply?.length) throw new Error("empty chat reply");
      return body.chatReply.slice(0, 50) + "…";
    });

    await check("POST /api/support/cql (generate)", async () => {
      const { body } = await authJson(req, "/api/support/cql", {
        method: "POST",
        allowError: true,
        data: JSON.stringify({ query: "malicious IP last 24h confidence 90" }),
      });
      if (body.error && !body.result?.cql) throw new Error(body.error);
      return body.result?.cql ? "CQL generated" : "needs CQL index (run index first)";
    });

    await check("POST /api/support/test (8 cases)", async () => {
      const { body } = await authJson(req, "/api/support/test", {
        method: "POST",
        data: "{}",
      });
      if (body.passed < 8) {
        const fails = body.results?.filter((r) => !r.pass).map((r) => r.id).join(", ");
        throw new Error(`${body.passed}/${body.total} passed — failed: ${fails}`);
      }
      return `${body.passed}/${body.total} passed`;
    });
  } finally {
    await browser.close();
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log("\nFailed:");
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  process.exit(1);
}
