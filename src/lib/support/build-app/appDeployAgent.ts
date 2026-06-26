import "server-only";

import { resolveBuildAppCredentials, hasGitHubPushCredentials, type BuildAppCredentials } from "./credentials";
import { createDeploymentPlan, deployProject, runProjectBuild } from "./deploy";
import { checkVercelReadiness } from "./vercel-readiness";
import { getProject } from "./project-store";
import type { DeploymentTarget } from "./types";

export interface AppDeployAgentResult {
  readiness: ReturnType<typeof checkVercelReadiness>;
  plan: ReturnType<typeof createDeploymentPlan>;
  explanation: string;
  needsApproval: boolean;
  buildOutput?: string;
  buildOk?: boolean;
}

export async function runAppDeployAgent(
  projectId: string,
  target: DeploymentTarget = "preview",
  credentials?: BuildAppCredentials
): Promise<AppDeployAgentResult> {
  const project = getProject(projectId);
  if (!project) throw new Error("Project not found");

  const readiness = checkVercelReadiness(projectId);
  const plan = createDeploymentPlan(projectId, target, credentials);

  const build =
    project.buildOk === true
      ? {
          ok: true,
          buildOk: true,
          output: project.buildOutput ?? "Build already passed.",
          preflightOk: true,
          commands: [],
        }
      : await runProjectBuild(projectId);

  const resolved = resolveBuildAppCredentials(credentials);
  const explanation = [
    `Deployment plan for **${project.name}** (${target}).`,
    build.ok ? "Build passed." : "Build failed — fix errors before deploying.",
    plan.mock
      ? "**Mock deploy mode** — paste a Vercel token below (or set VERCEL_TOKEN on the server) for a real preview link."
      : "Vercel token detected — deploy uses the Vercel REST API (no local npm/CLI).",
    hasGitHubPushCredentials(resolved)
      ? "GitHub token + repo detected — files will be pushed before deploy."
      : "",
    readiness.issues.length ? `\nNotes:\n${readiness.issues.map((i) => `- ${i}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    readiness,
    plan,
    explanation,
    needsApproval: true,
    buildOutput: build.output,
    buildOk: build.ok,
  };
}

export async function executeApprovedDeploy(
  projectId: string,
  target: DeploymentTarget,
  credentials?: BuildAppCredentials
) {
  return deployProject(projectId, target, credentials);
}
