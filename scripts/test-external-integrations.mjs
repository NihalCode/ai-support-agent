#!/usr/bin/env node
/** Validate integration credentials (same vars as Vercel) against live provider APIs. */
import { readFileSync, existsSync } from "node:fs";

if (!existsSync(".env.local")) {
  console.error("Missing .env.local");
  process.exit(2);
}

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (!m) continue;
  env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`✓ ${name} — ${detail}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ name, ok: false, detail: msg });
    console.error(`✗ ${name} — ${msg}`);
  }
}

await check("Slack auth.test", async () => {
  const token = env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN missing");
  const res = await fetch("https://slack.com/api/auth.test", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  if (!body.ok) throw new Error(body.error ?? "auth.test failed");
  return `team=${body.team}`;
});

await check("Zendesk tickets", async () => {
  const { ZENDESK_SUBDOMAIN: sub, ZENDESK_EMAIL: email, ZENDESK_API_TOKEN: token } = env;
  if (!sub || !email || !token) throw new Error("ZENDESK_* missing");
  const auth = Buffer.from(`${email}/token:${token}`).toString("base64");
  const res = await fetch(`https://${sub}.zendesk.com/api/v2/tickets.json?per_page=1`, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return `${body.count ?? body.tickets?.length ?? 0} tickets accessible`;
});

await check("Confluence spaces", async () => {
  const { CONFLUENCE_BASE_URL: base, CONFLUENCE_EMAIL: email, CONFLUENCE_API_TOKEN: token } = env;
  if (!base || !email || !token) throw new Error("CONFLUENCE_* missing");
  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  const url = `${base.replace(/\/$/, "")}/wiki/rest/api/space?limit=1`;
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HTTP ${res.status}: ${t.slice(0, 120)}`);
  }
  const body = await res.json();
  return `${body.results?.length ?? 0} space(s)`;
});

await check("Jira project search", async () => {
  const { JIRA_BASE_URL: base, JIRA_EMAIL: email, JIRA_API_TOKEN: token, JIRA_PROJECT_KEY: key } = env;
  if (!base || !email || !token) throw new Error("JIRA_* missing");
  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  const jql = key ? `project=${key}` : "order by created DESC";
  const url = `${base.replace(/\/$/, "")}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=1`;
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HTTP ${res.status}: ${t.slice(0, 120)}`);
  }
  const body = await res.json();
  return `${body.total ?? body.issues?.length ?? 0} issues`;
});

await check("OpenAI models", async () => {
  const key = env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY missing");
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return "ok";
});

await check("Pinecone index", async () => {
  const { PINECONE_API_KEY: key, PINECONE_INDEX_NAME: index } = env;
  if (!key || !index) throw new Error("PINECONE_* missing");
  const res = await fetch(`https://api.pinecone.io/indexes/${encodeURIComponent(index)}`, {
    headers: { "Api-Key": key, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return `status=${body.status ?? "ready"}`;
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} provider checks passed`);
if (failed.length) process.exit(1);
