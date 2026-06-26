import "server-only";

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { VercelReadinessReport } from "./types";
import { getProject } from "./project-store";

const REQUIRED_ENV = ["CYWARE_BASE_URL", "CYWARE_ACCESS_ID", "CYWARE_SECRET_KEY"];

export function checkVercelReadiness(projectId: string): VercelReadinessReport {
  const p = getProject(projectId);
  if (!p) {
    return { ready: false, issues: ["Project not found."], hasVercelJson: false, hasBuildScript: false, envVarsRequired: REQUIRED_ENV, envVarsPresent: [] };
  }

  const issues: string[] = [];
  const pkgPath = path.join(p.rootDir, "package.json");
  let hasBuildScript = false;
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, string> };
      hasBuildScript = Boolean(pkg.scripts?.build);
      if (!hasBuildScript) issues.push("package.json missing build script.");
    } catch {
      issues.push("package.json is invalid JSON.");
    }
  } else {
    issues.push("package.json not found — scaffold the app first.");
  }

  const hasVercelJson = existsSync(path.join(p.rootDir, "vercel.json"));
  const envExample = existsSync(path.join(p.rootDir, ".env.local.example"));
  if (!envExample) issues.push(".env.local.example missing — add env placeholders.");

  const envVarsPresent = REQUIRED_ENV.filter((k) => Boolean(process.env[k]));
  if (envVarsPresent.length === 0) {
    issues.push("Cyware credentials not configured on server (expected — use .env.local.example in generated app).");
  }

  if (!process.env.VERCEL_TOKEN) {
    issues.push("VERCEL_TOKEN not set — preview deploy will use mock mode.");
  }

  return {
    ready: issues.filter((i) => !i.includes("mock")).length === 0 || hasBuildScript,
    issues,
    hasVercelJson,
    hasBuildScript,
    envVarsRequired: REQUIRED_ENV,
    envVarsPresent,
  };
}
