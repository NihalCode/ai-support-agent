#!/usr/bin/env node
/**
 * Remove Zendesk + Confluence content created by seed-integration-test-content.mjs
 *
 * Usage: node scripts/cleanup-integration-test-content.mjs
 */
import { readFileSync, existsSync } from "node:fs";

if (!existsSync(".env.local")) {
  console.error("Missing .env.local");
  process.exit(2);
}

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const MARKER = "AI-SUPPORT-INTEGRATION-TEST";
const RUNBOOK_TITLE_PREFIX = "Runbook: CTIX Open API 401";

const {
  ZENDESK_SUBDOMAIN,
  ZENDESK_EMAIL,
  ZENDESK_API_TOKEN,
  CONFLUENCE_BASE_URL,
  CONFLUENCE_EMAIL,
  CONFLUENCE_API_TOKEN,
  CONFLUENCE_SPACE_KEY,
} = env;

function zendeskAuth() {
  return Buffer.from(`${ZENDESK_EMAIL}/token:${ZENDESK_API_TOKEN}`).toString("base64");
}

function confluenceAuth() {
  return Buffer.from(`${CONFLUENCE_EMAIL}:${CONFLUENCE_API_TOKEN}`).toString("base64");
}

function zendeskHost() {
  return ZENDESK_SUBDOMAIN.includes(".")
    ? ZENDESK_SUBDOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "")
    : `${ZENDESK_SUBDOMAIN}.zendesk.com`;
}

async function cleanupZendesk() {
  if (!ZENDESK_SUBDOMAIN || !ZENDESK_EMAIL || !ZENDESK_API_TOKEN) {
    console.log("⊘ Zendesk env missing — skip");
    return 0;
  }
  const base = `https://${zendeskHost()}`;
  const q = encodeURIComponent(`type:ticket "${MARKER}"`);
  const res = await fetch(`${base}/api/v2/search.json?query=${q}`, {
    headers: { Authorization: `Basic ${zendeskAuth()}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Zendesk search HTTP ${res.status}`);
  const body = await res.json();
  const tickets = body.results ?? [];
  let n = 0;
  for (const t of tickets) {
    const del = await fetch(`${base}/api/v2/tickets/${t.id}.json`, {
      method: "DELETE",
      headers: { Authorization: `Basic ${zendeskAuth()}`, Accept: "application/json" },
    });
    if (del.ok) {
      console.log(`✓ Deleted Zendesk ticket ZD-${t.id}`);
      n++;
      continue;
    }
    const close = await fetch(`${base}/api/v2/tickets/${t.id}.json`, {
      method: "PUT",
      headers: {
        Authorization: `Basic ${zendeskAuth()}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ticket: { status: "closed", comment: { body: `${MARKER} — closed by cleanup script`, public: false } },
      }),
    });
    if (close.ok) {
      console.log(`✓ Closed Zendesk ticket ZD-${t.id} (delete not permitted)`);
      n++;
    } else {
      console.warn(`✗ Could not remove ZD-${t.id}: HTTP ${del.status}/${close.status}`);
    }
  }
  if (n === 0) console.log("✓ No Zendesk test tickets found");
  return n;
}

async function cleanupConfluence() {
  if (!CONFLUENCE_BASE_URL || !CONFLUENCE_EMAIL || !CONFLUENCE_API_TOKEN) {
    console.log("⊘ Confluence env missing — skip");
    return 0;
  }
  const base = CONFLUENCE_BASE_URL.replace(/\/$/, "");
  const space = CONFLUENCE_SPACE_KEY?.trim();
  if (!space) throw new Error("CONFLUENCE_SPACE_KEY required");

  const headers = {
    Authorization: `Basic ${confluenceAuth()}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  const cql = encodeURIComponent(
    `space=${space} AND type=page AND (text ~ "${MARKER}" OR title ~ "${RUNBOOK_TITLE_PREFIX}")`
  );
  const res = await fetch(`${base}/wiki/rest/api/content/search?cql=${cql}&limit=20`, { headers });
  if (!res.ok) throw new Error(`Confluence search HTTP ${res.status}`);
  const body = await res.json();
  const pages = body.results ?? [];
  let n = 0;
  for (const p of pages) {
    const del = await fetch(`${base}/wiki/rest/api/content/${p.id}`, { method: "DELETE", headers });
    if (del.ok) {
      console.log(`✓ Deleted Confluence page ${p.title} (${p.id})`);
      n++;
    } else {
      console.warn(`✗ Could not delete Confluence page ${p.id}: HTTP ${del.status}`);
    }
  }
  if (n === 0) console.log("✓ No Confluence test pages found");
  return n;
}

console.log("\nCleaning integration test content…\n");
const z = await cleanupZendesk();
const c = await cleanupConfluence();
console.log(`\nDone — removed ${z} Zendesk ticket(s), ${c} Confluence page(s).\n`);
