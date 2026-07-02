import "server-only";

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { isTestMode } from "@/lib/test-mode";
import { getProject, saveProject, tryAcquireBuildLock, releaseBuildLock } from "./project-store";
import type { BuildAppDeployment, DeploymentPlan, DeploymentTarget } from "./types";
import { checkVercelReadiness } from "./vercel-readiness";
import { runBuildPreflight, formatPreflightReport } from "./preflight";
import {
  formatCommandLog,
  runCommand,
  shouldMockProjectCommands,
  type CommandResult,
} from "./command-runner";
import { classifyBuildError } from "./error-classify";
import {
  type BuildAppCredentials,
  hasGitHubPushCredentials,
  hasVercelDeployCredentials,
  resolveBuildAppCredentials,
} from "./credentials";
import { deployToVercelApi } from "./vercel-api-deploy";
import { pushProjectToGitHub } from "./github-api-push";
import { validateAndFixProjectSources, formatSourceValidationReport } from "./source-validation";

export interface ProjectBuildResult {
  ok: boolean;
  output: string;
  buildOk: boolean;
  testOk?: boolean;
  preflightOk: boolean;
  commands: CommandResult[];
  classification?: ReturnType<typeof classifyBuildError>;
}

export function createDeploymentPlan(
  projectId: string,
  target: DeploymentTarget,
  credentials?: BuildAppCredentials
): DeploymentPlan {
  const readiness = checkVercelReadiness(projectId);
  const resolved = resolveBuildAppCredentials(credentials);
  const mock = isTestMode() || !hasVercelDeployCredentials(resolved);

  return {
    projectId,
    target,
    steps: [
      "Preflight: verify package.json, app directory, dependencies",
      "npm install in generated app directory",
      "npm run build (must exit 0)",
      "npm test if configured (must exit 0)",
      mock ? "Mock Vercel deploy (no Vercel token — paste one in Deploy settings)" : `Vercel ${target} deploy via REST API`,
      "Return deployment URL",
    ],
    risks: [
      ...(target === "production" ? ["Production deploy affects live users."] : ["Preview deploy may expose WIP features."]),
      ...readiness.issues.filter((i) => !i.includes("mock")),
    ],
    requiresApproval: true,
    mock,
  };
}

function packageHasTestScript(cwd: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8")) as { scripts?: Record<string, string> };
    return Boolean(pkg.scripts?.test);
  } catch {
    return false;
  }
}

export async function runProjectBuild(projectId: string): Promise<ProjectBuildResult> {
  const p = getProject(projectId);
  if (!p) {
    return {
      ok: false,
      buildOk: false,
      preflightOk: false,
      output: "Project not found.",
      commands: [],
    };
  }

  if (!tryAcquireBuildLock(projectId)) {
    return {
      ok: false,
      buildOk: p.buildOk ?? false,
      preflightOk: false,
      output: "A build is already running for this app. Please wait for it to finish.",
      commands: [],
    };
  }

  try {
    return await runProjectBuildInner(projectId, p);
  } finally {
    releaseBuildLock(projectId);
  }
}

async function runProjectBuildInner(projectId: string, p: NonNullable<ReturnType<typeof getProject>>): Promise<ProjectBuildResult> {
  const mockMode = shouldMockProjectCommands();
  const mockFail = process.env.MOCK_BUILD_FAIL === "true";
  const preflight = runBuildPreflight(p.rootDir);
  const commands: CommandResult[] = [];

  p.status = "building";
  saveProject(p);

  if (!preflight.ok) {
    const output = formatPreflightReport(preflight);
    p.buildOk = false;
    p.buildMock = mockMode || commands.some((c) => c.mock);
    p.buildOutput = output;
    p.status = "failed";
    saveProject(p);
    return {
      ok: false,
      buildOk: false,
      preflightOk: false,
      output,
      commands,
      classification: classifyBuildError(output),
    };
  }

  const sourceCheck = validateAndFixProjectSources(p.rootDir);
  if (!sourceCheck.ok) {
    const output = formatSourceValidationReport(sourceCheck);
    p.buildOk = false;
    p.buildMock = mockMode || commands.some((c) => c.mock);
    p.buildOutput = output;
    p.status = "failed";
    saveProject(p);
    return {
      ok: false,
      buildOk: false,
      preflightOk: preflight.ok,
      output,
      commands,
      classification: classifyBuildError(output),
    };
  }

  const preface = [
    formatPreflightReport(preflight),
    sourceCheck.fixed.length ? `Source auto-fix: ${sourceCheck.fixed.join(", ")}` : "",
    mockMode
      ? process.env.VERCEL === "1"
        ? "[MOCK MODE] Vercel serverless — install/build simulated. Set BUILD_APP_REAL_COMMANDS=true for real npm on a worker with network + disk."
        : "[MOCK MODE] Commands are simulated — install/build not executed on disk."
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const install = runCommand("npm install --no-audit --no-fund", p.rootDir, {
    mock: mockMode,
    mockExitCode: mockFail ? 1 : 0,
    mockOutput: mockFail
      ? "npm ERR! mock install failure\nsh: line 1: next: command not found"
      : "[MOCK] npm install — dependencies installed (simulated)",
    timeoutMs: 180_000,
  });
  commands.push(install);

  if (install.status !== "success" || install.exitCode !== 0) {
    const output = `${preface}\n\n${formatCommandLog(commands)}`;
    const classification = classifyBuildError(install.stderr || install.stdout || output);
    p.buildOk = false;
    p.buildMock = mockMode || commands.some((c) => c.mock);
    p.buildOutput = output;
    p.status = "failed";
    saveProject(p);
    return { ok: false, buildOk: false, preflightOk: true, output, commands, classification };
  }

  const build = runCommand("npm run build", p.rootDir, {
    mock: mockMode,
    mockExitCode: mockFail ? 127 : 0,
    mockOutput: mockFail
      ? "sh: line 1: next: command not found\nCommand failed: npm run build"
      : "[MOCK] npm run build — exit 0 (simulated)",
    timeoutMs: 120_000,
  });
  commands.push(build);

  if (build.status !== "success" || build.exitCode !== 0) {
    const output = `${preface}\n\n${formatCommandLog(commands)}`;
    const classification = classifyBuildError(build.stderr || build.stdout || output);
    p.buildOk = false;
    p.buildMock = mockMode || commands.some((c) => c.mock);
    p.buildOutput = output;
    p.status = "failed";
    saveProject(p);
    return { ok: false, buildOk: false, preflightOk: true, output, commands, classification };
  }

  let testOk: boolean | undefined;
  if (packageHasTestScript(p.rootDir)) {
    const test = runCommand("npm test", p.rootDir, {
      mock: mockMode,
      mockExitCode: 0,
      mockOutput: "[MOCK] npm test — exit 0 (simulated)",
      timeoutMs: 120_000,
    });
    commands.push(test);
    testOk = test.status === "success" && test.exitCode === 0;
    if (!testOk) {
      const output = `${preface}\n\n${formatCommandLog(commands)}`;
      p.buildOk = false;
      p.testOk = false;
      p.testOutput = output;
      p.buildOutput = output;
      p.status = "failed";
      saveProject(p);
      return {
        ok: false,
        buildOk: false,
        testOk: false,
        preflightOk: true,
        output,
        commands,
        classification: classifyBuildError(test.stderr || test.stdout),
      };
    }
  }

  const output = `${preface}\n\n${formatCommandLog(commands)}`;
  p.buildOk = true;
  p.buildMock = mockMode || commands.some((c) => c.mock);
  p.testOk = testOk ?? true;
  p.buildOutput = output;
  p.testOutput = testOk ? output : p.testOutput;
  p.status = "ready";
  saveProject(p);

  return {
    ok: true,
    buildOk: true,
    testOk: testOk ?? true,
    preflightOk: true,
    output,
    commands,
  };
}

export async function deployProject(
  projectId: string,
  target: DeploymentTarget,
  credentials?: BuildAppCredentials
): Promise<BuildAppDeployment> {
  const p = getProject(projectId);
  if (!p) throw new Error("Project not found");

  if (p.buildOk !== true) {
    throw new Error("Build must pass before deployment. Run Test my app first.");
  }

  const resolved = resolveBuildAppCredentials(credentials);
  const plan = createDeploymentPlan(projectId, target, credentials);
  p.status = "deploying";
  saveProject(p);

  const mock = plan.mock;
  let url: string;
  let logs: string;
  const logParts: string[] = [];

  if (!mock && hasGitHubPushCredentials(resolved)) {
    const push = await pushProjectToGitHub({
      token: resolved.githubToken!,
      repo: resolved.githubRepo!,
      rootDir: p.rootDir,
      message: `Build App: ${p.name}`,
      branch: resolved.githubBranch ?? undefined,
    });
    p.gitBranch = push.branch;
    p.lastCommit = push.commitSha;
    logParts.push(`GitHub push: ${push.url}`, `Commit: ${push.commitSha.slice(0, 7)}`);
    saveProject(p);
  }

  if (mock) {
    url = `https://mock-preview.vercel.app/apps/${projectId.slice(0, 8)}`;
    logs = [
      `[MOCK DEPLOY — not a real Vercel URL]`,
      `Target: ${target}`,
      `Project: ${p.name}`,
      `Build: verified (exit 0)`,
      `Paste a Vercel token in Deploy settings (or set VERCEL_TOKEN on the server) for a real preview link.`,
      ...logParts,
    ].join("\n");
  } else {
    if (!existsSync(path.join(p.rootDir, "package.json"))) {
      throw new Error("Cannot deploy — generated app package.json missing.");
    }

    const sourceCheck = validateAndFixProjectSources(p.rootDir);
    if (!sourceCheck.ok) {
      const msg = formatSourceValidationReport(sourceCheck);
      p.status = "failed";
      saveProject(p);
      throw new Error(msg);
    }

    try {
      const result = await deployToVercelApi({
        token: resolved.vercelToken!,
        teamId: resolved.vercelTeamId,
        projectName: p.name,
        rootDir: p.rootDir,
        target,
      });
      url = result.url;
      logs = [...logParts, result.logs].filter(Boolean).join("\n");
    } catch (e) {
      logs = [...logParts, e instanceof Error ? e.message : "Deploy failed"].join("\n");
      p.status = "failed";
      p.buildOk = false;
      p.buildOutput = logs;
      saveProject(p);
      throw new Error(logs.slice(0, 800));
    }
  }

  const deployment: BuildAppDeployment = {
    id: crypto.randomUUID(),
    target,
    url,
    state: mock ? "mock" : "ready",
    mock,
    logs,
    createdAt: new Date().toISOString(),
  };

  p.deployments.unshift(deployment);
  p.previewUrl = url;
  p.status = "deployed";
  saveProject(p);
  return deployment;
}
