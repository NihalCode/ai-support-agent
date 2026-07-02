/**
 * Push selected vars from .env.local to Vercel as SENSITIVE (values never printed).
 * Usage: node scripts/vercel-env-push.mjs
 * Requires: vercel CLI logged in, .env.local present, run from repo root.
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const envFile = ".env.local";
if (!existsSync(envFile)) {
  console.error("Missing .env.local — nothing to push.");
  process.exit(1);
}

/** All production integration + auth secrets — stored sensitive on Vercel. */
const KEYS = [
  "APP_BASE_URL",
  "AUTH0_DOMAIN",
  "AUTH0_CLIENT_ID",
  "AUTH0_CLIENT_SECRET",
  "AUTH0_SECRET",
  "DEFAULT_ORG_ID",
  "INTEGRATION_SECRET_KEY",
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "PINECONE_API_KEY",
  "PINECONE_INDEX_NAME",
  "PINECONE_CLOUD",
  "PINECONE_REGION",
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET",
  "ZENDESK_SUBDOMAIN",
  "ZENDESK_EMAIL",
  "ZENDESK_API_TOKEN",
  "CONFLUENCE_BASE_URL",
  "CONFLUENCE_EMAIL",
  "CONFLUENCE_API_TOKEN",
  "CONFLUENCE_SPACE_KEY",
  "JIRA_BASE_URL",
  "JIRA_EMAIL",
  "JIRA_API_TOKEN",
  "JIRA_PROJECT_KEY",
];

function parseEnvFile(content) {
  const vars = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (KEYS.includes(k) && v) vars[k] = v;
  }
  return vars;
}

const vars = parseEnvFile(readFileSync(envFile, "utf8"));
const targets = ["production", "preview"];
let ok = 0;
let skip = 0;

for (const [k, v] of Object.entries(vars)) {
  for (const target of targets) {
    const r = spawnSync(
      "npx",
      ["vercel", "env", "add", k, target, "--force", "--sensitive", "--yes"],
      { input: v, encoding: "utf8", cwd: process.cwd(), shell: true, stdio: ["pipe", "pipe", "pipe"] }
    );
    if (r.status === 0) {
      ok++;
      console.log(`OK (sensitive) ${k}@${target}`);
    } else {
      skip++;
      const err = (r.stderr || r.stdout || "").toString().replace(/[^\x20-\x7E\n]/g, " ").slice(0, 120);
      console.log(`SKIP ${k}@${target}${err ? `: ${err.trim()}` : ""}`);
    }
  }
}

console.log(`Done. ${ok} set, ${skip} skipped. Values were not logged.`);
