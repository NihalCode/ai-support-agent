#!/usr/bin/env node
/**
 * Rigorous production smoke test for ai-support-agent.
 * Usage: node scripts/smoke-test-production.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? "https://ai-support-agent-ecru.vercel.app";

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

await check("GET /api/support/health", async () => {
  const { body } = await json("/api/support/health");
  const live = body.connectors?.filter((c) => c.ok).map((c) => c.name).join(", ");
  if (!body.connectors?.length) throw new Error("no connectors");
  return `live: ${live}`;
});

await check("GET /api/support/status", async () => {
  const { body } = await json("/api/support/status");
  if (!body.integrations?.openai?.configured) throw new Error("openai not configured");
  return `repo=${body.mode?.repo} sessions=${body.mode?.sessions}`;
});

await check("GET /api/support/tickets (recent)", async () => {
  const { body } = await json("/api/support/tickets");
  const n = body.jira?.issues?.length ?? 0;
  return `${n} recent Jira issues`;
});

await check("GET /api/support/tickets?q=indicator", async () => {
  const { body } = await json("/api/support/tickets?q=indicator");
  return `jira=${body.jira?.issues?.length ?? 0} gh=${body.github?.issues?.length ?? 0}`;
});

await check("GET /api/support/sources", async () => {
  const { body } = await json("/api/support/sources");
  return `${body.sources?.length ?? 0} sources`;
});

await check("GET /api/support/cyware?product=ctix", async () => {
  const { body } = await json("/api/support/cyware?product=ctix");
  if (!body.products?.ctix?.configured) throw new Error("CTIX not configured");
  return body.products.ctix.detail ?? "configured";
});

await check("POST /api/support/investigate (vague)", async () => {
  const { body } = await json("/api/support/investigate", {
    method: "POST",
    body: JSON.stringify({ query: { text: "API not working" } }),
  });
  if (!body.needsMoreInfo) throw new Error("expected needsMoreInfo");
  return `${body.missingQuestions?.length} questions`;
});

await check("POST /api/support/investigate (full)", async () => {
  const { body } = await json("/api/support/investigate", {
    method: "POST",
    body: JSON.stringify({
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
  globalThis.__sessionId = body.sessionId;
  return `status=${body.report.currentStatus} github=${body.context?.modes?.github}`;
});

await check("GET /api/support/investigate?sessionId= (after create)", async () => {
  const sid = globalThis.__sessionId;
  if (!sid) throw new Error("no session");
  const { body } = await json(`/api/support/investigate?sessionId=${encodeURIComponent(sid)}`);
  if (!body.context?.sessionId) throw new Error("session not persisted");
  return "persisted";
});

await check("POST /api/support/investigate (chat)", async () => {
  const sid = globalThis.__sessionId;
  if (!sid) throw new Error("no session");
  const { body } = await json("/api/support/investigate", {
    method: "POST",
    body: JSON.stringify({ sessionId: sid, message: "Is this a known Jira issue?" }),
  });
  if (!body.chatReply?.length) throw new Error("empty chat reply");
  return body.chatReply.slice(0, 50) + "…";
});

await check("POST /api/support/investigate/actions (pr-description)", async () => {
  const sid = globalThis.__sessionId;
  const { body } = await json("/api/support/investigate/actions", {
    method: "POST",
    body: JSON.stringify({ sessionId: sid, action: "pr-description" }),
  });
  if (!body.description?.length) throw new Error("empty PR description");
  return `${body.description.length} chars`;
});

await check("POST /api/support/investigate/actions (generate-patch)", async () => {
  const sid = globalThis.__sessionId;
  const { body } = await json("/api/support/investigate/actions", {
    method: "POST",
    allowError: true,
    body: JSON.stringify({ sessionId: sid, action: "generate-patch" }),
  });
  return body.patch ? `patch: ${body.patch.filePath}` : "no patch (ok if repo not indexed)";
});

await check("POST /api/support/analyze (AISUP5-1)", async () => {
  const { body } = await json("/api/support/analyze", {
    method: "POST",
    body: JSON.stringify({ issueRef: "AISUP5-1", description: "playbook timeout" }),
  });
  if (!body.analysis?.summary) throw new Error("no analysis");
  return body.analysis.confidence;
});

await check("POST /api/support/comment", async () => {
  const { body: analyze } = await json("/api/support/analyze", {
    method: "POST",
    body: JSON.stringify({ issueRef: "AISUP5-1", description: "timeout" }),
  });
  const { body } = await json("/api/support/comment", {
    method: "POST",
    body: JSON.stringify({ analysis: analyze.analysis }),
  });
  if (!body.customer?.length) throw new Error("no customer comment");
  return "drafts ok";
});

await check("POST /api/support/cql (generate)", async () => {
  const { body } = await json("/api/support/cql", {
    method: "POST",
    allowError: true,
    body: JSON.stringify({ query: "malicious IP last 24h confidence 90" }),
  });
  if (body.error && !body.result?.cql) throw new Error(body.error);
  return body.result?.cql ? "CQL generated" : "needs CQL index (run index first)";
});

await check("POST /api/support/test (8 cases)", async () => {
  const { body } = await json("/api/support/test", {
    method: "POST",
    body: "{}",
  });
  if (body.passed < 8) {
    const fails = body.results?.filter((r) => !r.pass).map((r) => r.id).join(", ");
    throw new Error(`${body.passed}/${body.total} passed — failed: ${fails}`);
  }
  return `${body.passed}/${body.total} passed`;
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log("\nFailed:");
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  process.exit(1);
}
