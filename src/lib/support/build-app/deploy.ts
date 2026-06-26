import "server-only";

import { execSync } from "node:child_process";
import { isTestMode } from "@/lib/test-mode";
import { getProject, saveProject } from "./project-store";
import type { BuildAppDeployment, DeploymentPlan, DeploymentTarget } from "./types";
import { checkVercelReadiness } from "./vercel-readiness";

export function createDeploymentPlan(projectId: string, target: DeploymentTarget): DeploymentPlan {
  const readiness = checkVercelReadiness(projectId);
  const mock = isTestMode() || !process.env.VERCEL_TOKEN;

  return {
    projectId,
    target,
    steps: [
      "Verify package.json build script",
      "Run lint and build in project directory",
      mock ? "Mock Vercel deploy (TEST_MODE or missing VERCEL_TOKEN)" : `Vercel ${target} deploy via API`,
      "Return deployment URL",
    ],
    risks: target === "production" ? ["Production deploy affects live users."] : ["Preview deploy may expose WIP features."],
    requiresApproval: true,
    mock,
  };
}

export async function runProjectBuild(projectId: string): Promise<{ ok: boolean; output: string }> {
  const p = getProject(projectId);
  if (!p) return { ok: false, output: "Project not found." };

  if (isTestMode()) {
    const output = [
      "[mock] npm install — skipped in TEST_MODE",
      "[mock] npm run lint — passed",
      "[mock] npm run build — passed",
      "[mock] npm test — passed",
    ].join("\n");
    p.buildOk = true;
    p.testOk = true;
    p.buildOutput = output;
    p.testOutput = output;
    p.status = "ready";
    saveProject(p);
    return { ok: true, output };
  }

  p.status = "building";
  saveProject(p);

  try {
    const output = execSync("npm run build", {
      cwd: p.rootDir,
      encoding: "utf8",
      timeout: 120_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    p.buildOk = true;
    p.buildOutput = output;
    p.status = "ready";
    saveProject(p);
    return { ok: true, output };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const output = [err.stdout, err.stderr, err.message].filter(Boolean).join("\n");
    p.buildOk = false;
    p.buildOutput = output;
    p.status = "failed";
    saveProject(p);
    return { ok: false, output };
  }
}

export async function deployProject(
  projectId: string,
  target: DeploymentTarget
): Promise<BuildAppDeployment> {
  const p = getProject(projectId);
  if (!p) throw new Error("Project not found");

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
      `Build: ${p.buildOk ? "passed" : "not verified"}`,
      `Set VERCEL_TOKEN to deploy for real.`,
    ].join("\n");
  } else {
    try {
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
