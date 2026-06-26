#!/usr/bin/env node
/**
 * Pre-deployment gate — blocks deploy if critical tests fail.
 */
import { spawnSync } from "node:child_process";

const steps = [
  { name: "test:intents", cmd: "npm", args: ["run", "test:intents"] },
  { name: "test", cmd: "npm", args: ["test"] },
  { name: "typecheck", cmd: "npm", args: ["run", "typecheck"] },
  { name: "build", cmd: "npm", args: ["run", "build"] },
  { name: "test:e2e", cmd: "npm", args: ["run", "test:e2e"] },
  { name: "mcp:check", cmd: "npm", args: ["run", "mcp:check"] },
];

let failed = false;
for (const step of steps) {
  process.stdout.write(`\n▶ ${step.name}…\n`);
  const r = spawnSync(step.cmd, step.args, { stdio: "inherit", shell: true });
  if (r.status !== 0) {
    console.error(`\n✗ Pre-deploy blocked: ${step.name} failed (exit ${r.status})`);
    failed = true;
    break;
  }
  console.log(`✓ ${step.name} passed`);
}

if (failed) {
  process.exit(1);
}
console.log("\n✓ Pre-deployment checks passed — deploy is allowed.");
process.exit(0);
