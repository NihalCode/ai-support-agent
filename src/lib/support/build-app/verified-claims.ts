import type { BuildAppProject } from "./types";

export type IntegrationStatus = "verified_connected" | "not_connected" | "mock" | "backend_pending";

export interface VerifiedBuildAppIntegration {
  name: string;
  status: IntegrationStatus;
}

export interface VerifiedBuildAppClaims {
  canSayFilesWritten: boolean;
  canSayBuildPassed: boolean;
  canSayBuildChecked: boolean;
  canSayTestsPassed: boolean;
  canSayPreviewReady: boolean;
  canSayDeployComplete: boolean;
  canSayIntegrationConnected: boolean;
}

export interface VerifiedBuildAppState {
  filesWritten: boolean;
  filesWrittenAt?: string;
  installRan: boolean;
  installExitCode?: number | null;
  buildRan: boolean;
  buildExitCode?: number | null;
  buildVerified: boolean;
  buildMock: boolean;
  testsRan: boolean;
  testsExitCode?: number | null;
  testsVerified: boolean;
  previewStarted: boolean;
  previewUrl?: string;
  previewVerified: boolean;
  deployRan: boolean;
  deployUrl?: string;
  deployVerified: boolean;
  integrationsUsed: VerifiedBuildAppIntegration[];
  claims: VerifiedBuildAppClaims;
}

function emptyClaims(): VerifiedBuildAppClaims {
  return {
    canSayFilesWritten: false,
    canSayBuildPassed: false,
    canSayBuildChecked: false,
    canSayTestsPassed: false,
    canSayPreviewReady: false,
    canSayDeployComplete: false,
    canSayIntegrationConnected: false,
  };
}

export function emptyVerifiedState(): VerifiedBuildAppState {
  return {
    filesWritten: false,
    installRan: false,
    buildRan: false,
    buildVerified: false,
    buildMock: false,
    testsRan: false,
    testsVerified: false,
    previewStarted: false,
    previewVerified: false,
    deployRan: false,
    deployVerified: false,
    integrationsUsed: [],
    claims: emptyClaims(),
  };
}

export interface VerifyProjectOpts {
  /** When true, require package.json on disk (server-side). */
  diskVerified?: boolean;
}

/** Shared verification from project record — safe for client and server. */
export function verifyProjectState(
  project: BuildAppProject | null,
  opts: VerifyProjectOpts = {}
): VerifiedBuildAppState {
  if (!project) return emptyVerifiedState();

  const filesOnRecord = (project.files?.length ?? 0) > 0;
  const filesWritten = (project.appliedChanges?.length ?? 0) > 0 && filesOnRecord;

  const buildMock = project.buildMock ?? false;
  const buildVerified = project.buildOk === true;
  const testsVerified = project.testOk === true;
  const latestDeploy = project.deployments[0];
  const deployVerified =
    Boolean(latestDeploy) &&
    latestDeploy.state === "ready" &&
    !latestDeploy.mock &&
    buildVerified;
  const previewVerified = Boolean(project.previewUrl) && buildVerified;

  const integrationsUsed: VerifiedBuildAppIntegration[] = [];

  const claims: VerifiedBuildAppClaims = {
    canSayFilesWritten: filesWritten,
    canSayBuildPassed: buildVerified && !buildMock,
    canSayBuildChecked: buildVerified,
    canSayTestsPassed: testsVerified,
    canSayPreviewReady: previewVerified,
    canSayDeployComplete: deployVerified,
    canSayIntegrationConnected:
      integrationsUsed.length === 0 ||
      integrationsUsed.every((i) => i.status === "verified_connected"),
  };

  return {
    filesWritten,
    filesWrittenAt: filesWritten ? project.updatedAt : undefined,
    installRan:
      project.status === "building" ||
      project.status === "ready" ||
      project.status === "failed" ||
      buildVerified,
    buildRan: project.buildOk !== undefined,
    buildVerified,
    buildMock,
    testsRan: project.testOk !== undefined,
    testsVerified,
    previewStarted: Boolean(project.previewUrl),
    previewUrl: project.previewUrl,
    previewVerified,
    deployRan: (project.deployments?.length ?? 0) > 0,
    deployUrl: latestDeploy?.url,
    deployVerified,
    integrationsUsed,
    claims,
  };
}

export function formatVerifiedBuildStatus(v: VerifiedBuildAppState): string {
  if (v.deployVerified && v.deployUrl) return "Deployed";
  if (v.previewVerified && v.previewUrl) return "Preview ready";
  if (v.buildVerified && v.buildMock) return "Build check passed (simulated)";
  if (v.buildVerified) return "Build passed";
  if (v.filesWritten && !v.buildRan) return "Files created — build not verified yet";
  if (v.filesWritten) return "Files created";
  return "Awaiting approval";
}

export function safeBuildSuccessMessage(v: VerifiedBuildAppState): string {
  if (!v.claims.canSayBuildChecked) {
    return "Files were generated. Run **Test my app** to verify the build.";
  }
  if (v.buildMock) {
    return "Build check passed in simulated mode (no real npm compile on this host). Say **deploy** for a preview link.";
  }
  return "Build passed. Say **deploy** when you want a preview link.";
}

export function safeFilesCreatedMessage(v: VerifiedBuildAppState): string {
  if (!v.claims.canSayFilesWritten) {
    return "Plan updated — review the diff and approve to create files.";
  }
  return "Files are ready on disk. Click **Test my app** when you want me to verify the build.";
}

export function integrationHonestyNotes(integrations: VerifiedBuildAppIntegration[]): string {
  if (!integrations.length) return "";
  const lines = integrations.map((i) => {
    if (i.status === "verified_connected") {
      return `${i.name} is connected — live data paths can be wired after scaffold.`;
    }
    return `${i.name} is **not connected** — I'll scaffold the UI with a typed placeholder service marked backend-pending (demo data only until configured in Settings).`;
  });
  return `\n\n**Integrations:**\n${lines.join("\n")}`;
}

export function safePreviewMessage(v: VerifiedBuildAppState, url: string, mock?: boolean): string {
  if (!v.claims.canSayPreviewReady && !mock) {
    return "I can't open a preview until the build check passes.";
  }
  if (mock) {
    return `Demo preview link: ${url} (not a live deployment — connect Vercel for a real URL).`;
  }
  return `Preview is live: ${url}`;
}

export function readinessItems(project: BuildAppProject | null, hasPlan: boolean): {
  label: string;
  done: boolean;
}[] {
  const v = verifyProjectState(project);
  const awaitingApproval =
    Boolean(project?.pendingChanges?.length) &&
    (project?.appliedChanges?.length ?? 0) === 0 &&
    (project?.files?.length ?? 0) === 0;

  return [
    { label: "App plan created", done: hasPlan || Boolean(project?.plan) },
    { label: "Awaiting approval", done: awaitingApproval || v.filesWritten },
    { label: "Files created", done: v.claims.canSayFilesWritten },
    { label: "Build checked", done: v.claims.canSayBuildChecked },
    { label: "Preview ready", done: v.claims.canSayPreviewReady },
  ];
}
