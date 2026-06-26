#!/usr/bin/env node
/** Disable Vercel Authentication so *.vercel.app deployment links work without login. */
import { execSync } from "node:child_process";

try {
  execSync("npx vercel project protection disable --sso", {
    stdio: "inherit",
    env: process.env,
  });
  console.log("✓ Deployment URLs are public (Vercel SSO protection disabled)");
} catch (e) {
  console.error("Could not disable SSO protection. Run manually:");
  console.error("  npx vercel project protection disable --sso");
  process.exit(typeof e.status === "number" ? e.status : 1);
}
