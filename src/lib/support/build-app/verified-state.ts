import "server-only";

import { existsSync } from "node:fs";
import path from "node:path";

import type { CommandResult } from "./command-runner";
import type { BuildAppProject } from "./types";
import { getConfig, hasConfluence, hasJira, hasSlack, hasZendesk } from "../config";
import {
  type VerifiedBuildAppIntegration,
  type VerifiedBuildAppState,
  verifyProjectState,
  emptyVerifiedState,
} from "./verified-claims";

export type {
  IntegrationStatus,
  VerifiedBuildAppIntegration,
  VerifiedBuildAppClaims,
  VerifiedBuildAppState,
} from "./verified-claims";

export {
  integrationHonestyNotes,
  formatVerifiedBuildStatus,
  safeBuildSuccessMessage,
  safeFilesCreatedMessage,
  safePreviewMessage,
  readinessItems,
} from "./verified-claims";

const INTEGRATION_PATTERNS: { name: string; re: RegExp; connected: () => boolean }[] = [
  { name: "Zendesk", re: /\bzendesk\b/i, connected: () => hasZendesk(getConfig()) },
  { name: "Slack", re: /\bslack\b/i, connected: () => hasSlack(getConfig()) },
  { name: "Jira", re: /\bjira\b/i, connected: () => hasJira(getConfig()) },
  { name: "Confluence", re: /\bconfluence\b/i, connected: () => hasConfluence(getConfig()) },
];

/** Detect third-party integrations referenced in a build request. */
export function detectIntegrationsInText(text: string): VerifiedBuildAppIntegration[] {
  const out: VerifiedBuildAppIntegration[] = [];
  for (const { name, re, connected } of INTEGRATION_PATTERNS) {
    if (!re.test(text)) continue;
    out.push({
      name,
      status: connected() ? "verified_connected" : "backend_pending",
    });
  }
  return out;
}

function inferIntegrationsFromProject(project: BuildAppProject): VerifiedBuildAppIntegration[] {
  const text = [project.description, project.plan?.summary, project.plan?.features?.join(" ")].filter(Boolean).join(" ");
  return detectIntegrationsInText(text);
}

export function verifyBuildAppState(
  project: BuildAppProject | null,
  opts?: { commands?: CommandResult[] }
): VerifiedBuildAppState {
  if (!project) return emptyVerifiedState();

  const base = verifyProjectState(project, { diskVerified: false });
  const pkgExists = existsSync(path.join(project.rootDir, "package.json"));
  const filesWritten = base.filesWritten && pkgExists;

  const commands = opts?.commands ?? [];
  const installCmd = commands.find((c) => c.command.includes("npm install"));
  const buildCmd = commands.find((c) => c.command.includes("npm run build"));
  const testCmd = commands.find((c) => c.command.includes("npm test"));

  const buildMock = project.buildMock ?? commands.some((c) => c.mock) ?? false;
  const integrationsUsed = inferIntegrationsFromProject(project);

  const claims = {
    ...base.claims,
    canSayFilesWritten: filesWritten,
    canSayBuildPassed: base.buildVerified && !buildMock,
    canSayIntegrationConnected:
      integrationsUsed.length === 0 ||
      integrationsUsed.every((i) => i.status === "verified_connected"),
  };

  return {
    ...base,
    filesWritten,
    installRan: base.installRan || Boolean(installCmd),
    installExitCode: installCmd?.exitCode,
    buildRan: base.buildRan || Boolean(buildCmd),
    buildExitCode: buildCmd?.exitCode,
    buildMock,
    testsRan: base.testsRan || Boolean(testCmd),
    testsExitCode: testCmd?.exitCode,
    integrationsUsed,
    claims,
  };
}
