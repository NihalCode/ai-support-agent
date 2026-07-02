#!/usr/bin/env node
/**
 * Full Slack/investigation workflow test — CTIX, CFTR, Orchestrate, CQL (+ CSAP multi-product).
 * Seeds integration fixtures, runs Vitest product workflow, prints Slack prompts, then cleans up.
 *
 * Usage:
 *   node scripts/test-slack-full-workflow.mjs [--keep-seed] [--prod baseUrl]
 *
 * --keep-seed   Skip cleanup (leave Zendesk/Confluence test content)
 * --prod URL    Also run authenticated production investigate checks (needs AUTH0_E2E_*)
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const args = process.argv.slice(2);
const keepSeed = args.includes("--keep-seed");
const prodIdx = args.indexOf("--prod");
const prodBase = prodIdx >= 0 ? args[prodIdx + 1] : null;

const MARKER = "AI-SUPPORT-INTEGRATION-TEST";

/** One Slack thread per product area — mirrors enrichSlackThread + runInvestigation. */
const SLACK_PROMPTS = [
  {
    id: "ctix-401",
    product: "CTIX",
    prompt: `@YourBot We're seeing 401 Unauthorized on the CTIX Open API since this morning. Customer can't authenticate — signature may be expiring. Please investigate.`,
    expect: ["401", "CTIX", "Relevant docs", "authentication"],
  },
  {
    id: "cftr-incident",
    product: "CFTR",
    prompt: `@YourBot CFTR customer gets 401 creating an incident — POST to the incident API fails since this morning. Which CFTR endpoints and auth steps should we verify?`,
    expect: ["CFTR", "incident", "Relevant docs"],
  },
  {
    id: "orchestrate-playbook",
    product: "Orchestrate",
    prompt: `@YourBot Orchestrate playbook "Block Malicious IP" timed out after 45s. Need run logs, node results, and how to retry the playbook run.`,
    expect: ["Orchestrate", "playbook", "Relevant docs"],
  },
  {
    id: "cql-malicious-ip",
    product: "CQL",
    prompt: `@YourBot Write a CQL query for malicious IP indicators in the last 24 hours with confidence >= 90. Link the relevant CQL grammar docs.`,
    expect: ["CQL", "Relevant docs"],
  },
  {
    id: "multi-product",
    product: "CTIX+CFTR+Orchestrate+CSAP+CQL",
    prompt: `@YourBot Orchestrate playbook Enrich and Block High-Confidence IPs failed silently. Run CQL for malicious IP indicators last 24h confidence >= 90, enrich via CTIX threat data API, push CSAP intel card, trigger CFTR incident if more than 5 IPs match. TIMEOUT after 45s. Which APIs for run logs, CQL syntax, CTIX enrich, CSAP card, CFTR incident?`,
    expect: ["playbook", "CTIX", "CFTR", "CSAP", "CQL", "Relevant docs"],
  },
];

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { stdio: "inherit", shell: true, ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function section(title) {
  console.log(`\n${"=".repeat(60)}\n${title}\n${"=".repeat(60)}\n`);
}

section("1/4 — Seed Zendesk + Confluence test content");
if (!existsSync(".env.local")) {
  console.error("Missing .env.local — copy from .env.example and configure integrations.");
  process.exit(2);
}
run("node", ["scripts/seed-integration-test-content.mjs"]);

section("2/4 — Vitest: product endpoints, doc links, investigation workflow");
run("npx", ["vitest", "run", "src/lib/support/__tests__/full-product-workflow.test.ts"]);

if (prodBase) {
  section(`3/4 — Production investigate API (${prodBase})`);
  const email = process.env.AUTH0_E2E_EMAIL?.trim();
  const password = process.env.AUTH0_E2E_PASSWORD?.trim();
  if (!email || !password) {
    console.warn("Skipping production API — set AUTH0_E2E_EMAIL and AUTH0_E2E_PASSWORD");
  } else {
    run("node", ["scripts/test-production-investigate-products.mjs", prodBase], {
      env: { ...process.env, AUTH0_E2E_EMAIL: email, AUTH0_E2E_PASSWORD: password },
    });
  }
} else {
  section("3/4 — Production API (skipped — pass --prod https://ai-support-agent-ecru.vercel.app)");
}

section("4/4 — Slack copy/paste prompts (one thread each, new thread per prompt)");
console.log(`Marker for seeded data: ${MARKER}\n`);
for (const s of SLACK_PROMPTS) {
  console.log(`--- ${s.product} (${s.id}) ---`);
  console.log(s.prompt);
  console.log(`Expect in reply: ${s.expect.join(", ")}\n`);
}

if (!keepSeed) {
  section("Cleanup — remove test Zendesk/Confluence content");
  run("node", ["scripts/cleanup-integration-test-content.mjs"]);
} else {
  console.log("\n--keep-seed: Zendesk/Confluence test content left in place.\n");
}

console.log("\n✓ Full workflow test complete.\n");
