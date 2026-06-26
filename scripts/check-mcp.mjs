#!/usr/bin/env node
/**
 * Validate MCP server files and env vars (no credentials required).
 * Usage: node scripts/check-mcp.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const SERVER_FILES = [
  "mcp/servers/logs_server.py",
  "mcp/servers/cyware_api_server.py",
  "mcp/servers/api_importer_server.py",
];

const OPTIONAL_ENV = [
  "JIRA_BASE_URL",
  "JIRA_EMAIL",
  "JIRA_API_TOKEN",
  "GITHUB_TOKEN",
  "OPENAI_API_KEY",
  "PINECONE_API_KEY",
  "LOG_PROVIDER",
  "LOG_API_KEY",
  "CYWARE_BASE_URL",
  "MCP_SERVER_CONFIG_JSON",
];

let ok = true;

console.log("MCP check — AI Support Agent\n");

for (const rel of SERVER_FILES) {
  const abs = path.join(root, rel);
  if (existsSync(abs)) {
    console.log(`✓ ${rel}`);
  } else {
    console.log(`✗ missing ${rel}`);
    ok = false;
  }
}

const examplePath = path.join(root, ".cursor/mcp.json.example");
if (existsSync(examplePath)) {
  console.log("✓ .cursor/mcp.json.example");
  try {
    JSON.parse(readFileSync(examplePath, "utf8"));
    console.log("  valid JSON");
  } catch {
    console.log("✗ invalid JSON in mcp.json.example");
    ok = false;
  }
} else {
  console.log("✗ missing .cursor/mcp.json.example");
  ok = false;
}

const userMcp = path.join(root, ".cursor/mcp.json");
if (existsSync(userMcp)) {
  console.log("✓ .cursor/mcp.json (local — not committed)");
} else {
  console.log("○ .cursor/mcp.json not found — copy from .cursor/mcp.json.example");
}

console.log("\nEnv vars (optional for docs-only mode):");
for (const key of OPTIONAL_ENV) {
  const set = Boolean(process.env[key]?.trim());
  console.log(`  ${set ? "✓" : "○"} ${key}${set ? "" : " (unset)"}`);
}

console.log(ok ? "\nMCP check passed." : "\nMCP check failed — fix missing files.");
process.exit(ok ? 0 : 1);
