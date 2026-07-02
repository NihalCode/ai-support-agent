import "server-only";

import { isTestMode } from "@/lib/test-mode";
import {
  hasVercelDeployCredentials,
  resolveBuildAppCredentials,
  type BuildAppCredentials,
} from "./credentials";

export type BuildExecutionMode = "local" | "vercel-remote" | "worker" | "mock";

/** How install/build runs for generated apps. */
export function resolveBuildExecutionMode(credentials?: BuildAppCredentials): BuildExecutionMode {
  if (isTestMode()) return "mock";
  if (process.env.BUILD_APP_FORCE_MOCK === "true") return "mock";
  if (process.env.BUILD_APP_REAL_COMMANDS === "true") return "local";
  if (process.env.BUILD_APP_BUILD_WORKER_URL?.trim()) return "worker";

  if (process.env.VERCEL === "1") {
    const creds = credentials ? resolveBuildAppCredentials(credentials) : resolveBuildAppCredentials();
    if (hasVercelDeployCredentials(creds)) return "vercel-remote";
    if (process.env.BUILD_APP_MOCK_ON_VERCEL === "true") return "mock";
    return "local";
  }

  return "local";
}

export function shouldMockProjectCommands(mode?: BuildExecutionMode): boolean {
  return (mode ?? resolveBuildExecutionMode()) === "mock";
}

export function buildModeLabel(mode: BuildExecutionMode): string {
  switch (mode) {
    case "vercel-remote":
      return "Vercel remote build (real npm on Vercel infrastructure)";
    case "worker":
      return "Remote build worker";
    case "local":
      return "Local npm install/build";
    case "mock":
      return "Simulated build (test mode only)";
  }
}
