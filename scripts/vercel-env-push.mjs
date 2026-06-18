import { readFileSync, existsSync } from "node:fs";

const envFile = ".env.local";
if (!existsSync(envFile)) {
  console.error("Missing .env.local");
  process.exit(1);
}

const keys = [
  "OPENAI_API_KEY",
  "PINECONE_API_KEY",
  "PINECONE_INDEX_NAME",
  "PINECONE_CLOUD",
  "PINECONE_REGION",
];

const vars = {};
for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  const [, k, v] = m;
  if (keys.includes(k) && v.trim()) vars[k] = v.replace(/^["']|["']$/g, "");
}

import { spawnSync } from "node:child_process";

for (const [k, v] of Object.entries(vars)) {
  for (const target of ["production", "preview", "development"]) {
    const r = spawnSync(
      "npx",
      ["vercel@latest", "env", "add", k, target, "--force"],
      { input: v, encoding: "utf8", cwd: process.cwd(), shell: true }
    );
    const ok = r.status === 0;
    console.log(`${ok ? "OK" : "SKIP"} ${k}@${target}${ok ? "" : ": " + (r.stderr || "").trim().slice(0, 80)}`);
  }
}
