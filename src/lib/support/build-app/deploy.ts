import "server-only";

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { isTestMode } from "@/lib/test-mode";
import { getProject, saveProject } from "./project-store";
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

export interface ProjectBuildResult {
  ok: boolean;
  output: string;
  buildOk: boolean;
  testOk?: boolean;
  preflightOk: boolean;
  commands: CommandResult[];
  classification?: ReturnType<typeof classifyBuildError>;
}

export function createDeploymentPlan(projectId: string, target: DeploymentTarget): DeploymentPlan {
  const readiness = checkVercelReadiness(projectId);
  const mock = isTestMode() || !process.env.VERCEL_TOKEN;

  return {
    projectId,
    target,
    steps: [
      "Preflight: verify package.json, app directory, dependencies",
      "npm install in generated app directory",
      "npm run build (must exit 0)",
      "npm test if configured (must exit 0)",
      mock ? "Mock Vercel deploy (TEST_MODE or missing VERCEL_TOKEN)" : `Vercel ${target} deploy via API`,
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

  const mockMode = shouldMockProjectCommands();
  const mockFail = process.env.MOCK_BUILD_FAIL === "true";
  const preflight = runBuildPreflight(p.rootDir);
  const commands: CommandResult[] = [];

  p.status = "building";
  saveProject(p);

  if (!preflight.ok) {
    const output = formatPreflightReport(preflight);
    p.buildOk = false;
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

  const preface = [
    formatPreflightReport(preflight),
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
  target: DeploymentTarget
): Promise<BuildAppDeployment> {
  const p = getProject(projectId);
  if (!p) throw new Error("Project not found");

  if (p.buildOk !== true) {
    throw new Error("Build must pass before deployment. Run Test my app first.");
  }

  const plan = createDeploymentPlan(projectId, target);
  p.status = "deploying";
  saveProject(p);

  const mock = plan.mock;
  let url: string;
  let logs: string;

  if (mock) {
    url = `https://mock-preview.vercel.app/apps/${projectId.slice(0, 8)}`;
    logs = [
      `[MOCK DEPLOY — not a real Vercel URL]`,
      `Target: ${target}`,
      `Project: ${p.name}`,
      `Build: verified (exit 0)`,
      `Set VERCEL_TOKEN to deploy for real.`,
    ].join("\n");
  } else {
    if (!existsSync(path.join(p.rootDir, "package.json"))) {
      throw new Error("Cannot deploy — generated app package.json missing.");
    }
    try {
      const { execSync } = await import("node:child_process");
      const flag = target === "production" ? " --prod" : "";
      logs = execSync(`npx vercel deploy${flag} --yes`, {
        cwd: p.rootDir,
        encoding: "utf8",
        timeout: 300_000,
        env: { ...process.env },
      });
      const match = logs.match(/https:\/\/[^\s]+\.vercel\.app/);
      url = match?.[0] ?? `https://vercel.app/project/${projectId}`;
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      logs = [err.stdout, err.stderr, err.message].filter(Boolean).join("\n");
      p.status = "failed";
      saveProject(p);
      throw new Error(logs.slice(0, 500));
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
