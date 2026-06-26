import "server-only";

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const REQUIRED_DEPS = ["next", "react", "react-dom"] as const;
const RECOMMENDED_DEV_DEPS = ["typescript", "@types/node", "@types/react", "@types/react-dom"] as const;

export interface PreflightReport {
  ok: boolean;
  cwd: string;
  issues: string[];
  warnings: string[];
  hasPackageJson: boolean;
  hasBuildScript: boolean;
  hasAppDir: boolean;
  hasNodeModules: boolean;
  missingDependencies: string[];
  missingDevDependencies: string[];
}

export function runBuildPreflight(cwd: string): PreflightReport {
  const issues: string[] = [];
  const warnings: string[] = [];

  if (!existsSync(cwd)) {
    return {
      ok: false,
      cwd,
      issues: [`Project directory does not exist: ${cwd}`],
      warnings,
      hasPackageJson: false,
      hasBuildScript: false,
      hasAppDir: false,
      hasNodeModules: false,
      missingDependencies: [...REQUIRED_DEPS],
      missingDevDependencies: [],
    };
  }

  const pkgPath = path.join(cwd, "package.json");
  const hasPackageJson = existsSync(pkgPath);
  let hasBuildScript = false;
  const missingDependencies: string[] = [];
  const missingDevDependencies: string[] = [];

  if (!hasPackageJson) {
    issues.push("package.json is missing — scaffold the app before building.");
  } else {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      hasBuildScript = Boolean(pkg.scripts?.build);
      if (!hasBuildScript) issues.push("package.json is missing a build script.");

      for (const dep of REQUIRED_DEPS) {
        if (!pkg.dependencies?.[dep]) missingDependencies.push(dep);
      }
      if (missingDependencies.length) {
        issues.push(`package.json missing required dependencies: ${missingDependencies.join(", ")}`);
      }

      for (const dep of RECOMMENDED_DEV_DEPS) {
        if (!pkg.devDependencies?.[dep] && !pkg.dependencies?.[dep]) {
          missingDevDependencies.push(dep);
        }
      }
      if (missingDevDependencies.length) {
        warnings.push(`Optional dev dependencies missing: ${missingDevDependencies.join(", ")}`);
      }
    } catch {
      issues.push("package.json is invalid JSON.");
    }
  }

  const hasAppDir = existsSync(path.join(cwd, "app")) || existsSync(path.join(cwd, "pages"));
  if (!hasAppDir) issues.push("No app/ or pages/ directory found.");

  const hasNodeModules = existsSync(path.join(cwd, "node_modules"));
  if (!hasNodeModules) {
    warnings.push("node_modules not found — npm install will run before build.");
  }

  if (!existsSync(path.join(cwd, ".env.local.example"))) {
    warnings.push(".env.local.example missing (recommended for Cyware credentials).");
  }

  return {
    ok: issues.length === 0,
    cwd,
    issues,
    warnings,
    hasPackageJson,
    hasBuildScript,
    hasAppDir,
    hasNodeModules,
    missingDependencies,
    missingDevDependencies,
  };
}

export function formatPreflightReport(report: PreflightReport): string {
  const lines = [
    `Preflight ${report.ok ? "passed" : "failed"} (${report.cwd})`,
    ...report.issues.map((i) => `ERROR: ${i}`),
    ...report.warnings.map((w) => `WARN: ${w}`),
  ];
  return lines.join("\n");
}
