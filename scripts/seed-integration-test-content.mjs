#!/usr/bin/env node
/**
 * Seed Zendesk + Confluence test content aligned with Slack bot investigation queries.
 * Usage: node scripts/seed-integration-test-content.mjs
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

const {
  ZENDESK_SUBDOMAIN,
  ZENDESK_EMAIL,
  ZENDESK_API_TOKEN,
  CONFLUENCE_BASE_URL,
  CONFLUENCE_EMAIL,
  CONFLUENCE_API_TOKEN,
  CONFLUENCE_SPACE_KEY,
} = env;

const MARKER = "AI-SUPPORT-INTEGRATION-TEST";
const SUBJECT = "CTIX Open API returns 401 Unauthorized since this morning";
const BODY = `${MARKER}

Customer reports CTIX Open API authentication failures since this morning.

Symptoms:
- HTTP 401 Unauthorized on CTIX Open API calls
- Access ID and Signature may be expired or mismatched to tenant URL
- Affects indicator search and Open API integrations

Recommended checks:
1. Regenerate Signature and Expires in CTIX API Settings
2. Confirm tenant base URL matches Integrators CSV (e.g. cs-testv2.cyware.com/ctixapi)
3. Verify Access ID is active for Open API

Related internal ticket: AISUP5-1
`;

const RUNBOOK_TITLE = "Runbook: CTIX Open API 401 Unauthorized troubleshooting";
const RUNBOOK_BODY = `<p><strong>${MARKER}</strong></p>
<p>Use this runbook when customers report <strong>401 Unauthorized</strong> on the <strong>CTIX Open API</strong>.</p>
<h2>Symptoms</h2>
<ul>
<li>HTTP 401 on CTIX API since this morning</li>
<li>Open API calls fail with invalid or expired credentials</li>
<li>Indicator search and bulk endpoints return unauthorized</li>
</ul>
<h2>Resolution</h2>
<ol>
<li>Confirm CTIX tenant URL and Open API Access ID</li>
<li>Regenerate HMAC Signature and Expires</li>
<li>Validate clock skew on signature generation</li>
<li>Re-test POST /v3/indicators/search/</li>
</ol>
<p>Escalation: link Jira AISUP5-1 for engineering if tenant config is correct.</p>`;

function zendeskAuth() {
  return Buffer.from(`${ZENDESK_EMAIL}/token:${ZENDESK_API_TOKEN}`).toString("base64");
}

function confluenceAuth() {
  return Buffer.from(`${CONFLUENCE_EMAIL}:${CONFLUENCE_API_TOKEN}`).toString("base64");
}

async function seedZendesk() {
  if (!ZENDESK_SUBDOMAIN || !ZENDESK_EMAIL || !ZENDESK_API_TOKEN) {
    throw new Error("ZENDESK_* env vars missing");
  }
  const host = ZENDESK_SUBDOMAIN.includes(".")
    ? ZENDESK_SUBDOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "")
    : `${ZENDESK_SUBDOMAIN}.zendesk.com`;
  const base = `https://${host}`;

  const searchQ = encodeURIComponent(`type:ticket "${MARKER}"`);
  const searchRes = await fetch(`${base}/api/v2/search.json?query=${searchQ}`, {
    headers: { Authorization: `Basic ${zendeskAuth()}`, Accept: "application/json" },
  });
  if (!searchRes.ok) throw new Error(`Zendesk search HTTP ${searchRes.status}`);
  const searchBody = await searchRes.json();
  const existing = searchBody.results?.[0];
  if (existing?.id) {
    console.log(`✓ Zendesk ticket already exists: ZD-${existing.id}`);
    return { ref: `ZD-${existing.id}`, url: `${base}/agent/tickets/${existing.id}` };
  }

  const createRes = await fetch(`${base}/api/v2/tickets.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${zendeskAuth()}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ticket: {
        subject: SUBJECT,
        comment: { body: BODY },
        tags: ["ctix", "401", "open-api", "ai-support-test"],
        priority: "normal",
      },
    }),
  });
  if (!createRes.ok) {
    const t = await createRes.text();
    throw new Error(`Zendesk create HTTP ${createRes.status}: ${t.slice(0, 200)}`);
  }
  const created = await createRes.json();
  const id = created.ticket?.id;
  console.log(`✓ Created Zendesk ticket ZD-${id}`);
  return { ref: `ZD-${id}`, url: `${base}/agent/tickets/${id}` };
}

async function seedConfluence() {
  if (!CONFLUENCE_BASE_URL || !CONFLUENCE_EMAIL || !CONFLUENCE_API_TOKEN) {
    throw new Error("CONFLUENCE_* env vars missing");
  }
  const base = CONFLUENCE_BASE_URL.replace(/\/$/, "");
  const space = CONFLUENCE_SPACE_KEY?.trim();
  if (!space) throw new Error("CONFLUENCE_SPACE_KEY required");

  const headers = {
    Authorization: `Basic ${confluenceAuth()}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  const cql = encodeURIComponent(`space=${space} AND type=page AND title ~ "CTIX Open API 401"`);
  const searchRes = await fetch(`${base}/wiki/rest/api/content/search?cql=${cql}&limit=5`, { headers });
  if (!searchRes.ok) throw new Error(`Confluence search HTTP ${searchRes.status}`);
  const searchBody = await searchRes.json();
  const hit = searchBody.results?.find((p) => p.title?.includes("401"));
  if (hit?.id) {
    console.log(`✓ Confluence runbook already exists: ${hit.title} (${hit.id})`);
    return { id: hit.id, url: `${base}/wiki${hit._links?.webui ?? ""}` };
  }

  const createRes = await fetch(`${base}/wiki/rest/api/content`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      type: "page",
      title: RUNBOOK_TITLE,
      space: { key: space },
      body: { storage: { value: RUNBOOK_BODY, representation: "storage" } },
    }),
  });
  if (!createRes.ok) {
    const t = await createRes.text();
    throw new Error(`Confluence create HTTP ${createRes.status}: ${t.slice(0, 300)}`);
  }
  const page = await createRes.json();
  console.log(`✓ Created Confluence page: ${page.title} (${page.id})`);
  return { id: page.id, url: `${base}/wiki${page._links?.webui ?? ""}` };
}

async function verifySearch() {
  const host = ZENDESK_SUBDOMAIN.includes(".")
    ? ZENDESK_SUBDOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "")
    : `${ZENDESK_SUBDOMAIN}.zendesk.com`;
  const zBase = `https://${host}`;
  const q = encodeURIComponent("type:ticket CTIX 401");
  const zRes = await fetch(`${zBase}/api/v2/search.json?query=${q}&per_page=3`, {
    headers: { Authorization: `Basic ${zendeskAuth()}`, Accept: "application/json" },
  });
  const zBody = await zRes.json();
  const zCount = zBody.results?.length ?? 0;

  const cBase = CONFLUENCE_BASE_URL.replace(/\/$/, "");
  const space = CONFLUENCE_SPACE_KEY?.trim() ?? "";
  const cql = encodeURIComponent(
    `space=${space} AND type=page AND text ~ "401" AND text ~ "CTIX" ORDER BY lastmodified DESC`
  );
  const cRes = await fetch(`${cBase}/wiki/rest/api/content/search?cql=${cql}&limit=3`, {
    headers: { Authorization: `Basic ${confluenceAuth()}`, Accept: "application/json" },
  });
  const cBody = await cRes.json();
  const cCount = cBody.results?.length ?? 0;

  console.log(`✓ Verify Zendesk search "CTIX 401": ${zCount} hit(s)`);
  console.log(`✓ Verify Confluence search "401 CTIX": ${cCount} hit(s)`);
  return { zCount, cCount };
}

console.log("\nSeeding integration test content…\n");
const zendesk = await seedZendesk();
const confluence = await seedConfluence();
const { zCount, cCount } = await verifySearch();

console.log("\n--- Slack test message (copy/paste) ---\n");
console.log(
  `@YourBot We're seeing 401 on the CTIX Open API since this morning. Zendesk ${zendesk.ref}. Jira AISUP5-1. Please investigate authentication and Open API signature expiry.`
);
console.log("\n--- Expected in investigation ---\n");
console.log(`- Zendesk evidence: ${zCount > 0 ? "yes" : "CHECK — may need a minute to index"}`);
console.log(`- Confluence evidence: ${cCount > 0 ? "yes" : "CHECK — run Settings → Sync Confluence on production"}`);
console.log(`- Slack: bot reply + link to full report`);
console.log(`\nZendesk: ${zendesk.url}`);
console.log(`Confluence: ${confluence.url}\n`);

if (zCount === 0 || cCount === 0) process.exit(1);
