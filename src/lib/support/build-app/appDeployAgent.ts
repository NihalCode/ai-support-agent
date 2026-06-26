import "server-only";

import type { DeploymentTarget } from "./types";
import { createDeploymentPlan, deployProject, runProjectBuild } from "./deploy";
import { checkVercelReadiness } from "./vercel-readiness";
import { getProject } from "./project-store";

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
  target: DeploymentTarget = "preview"
): Promise<AppDeployAgentResult> {
  const project = getProject(projectId);
  if (!project) throw new Error("Project not found");

  const readiness = checkVercelReadiness(projectId);
  const plan = createDeploymentPlan(projectId, target);

  const build = await runProjectBuild(projectId);

  const explanation = [
    `Deployment plan for **${project.name}** (${target}).`,
    build.ok ? "Build passed." : "Build failed — fix errors before deploying.",
    plan.mock
      ? "**Mock deploy mode** — set VERCEL_TOKEN for real deployments."
      : "Vercel credentials detected — real deploy available after approval.",
    readiness.issues.length ? `\nNotes:\n${readiness.issues.map((i) => `- ${i}`).join("\n")}` : "",
  ].join("\n");

  return {
    readiness,
    plan,
    explanation,
    needsApproval: true,
    buildOutput: build.output,
    buildOk: build.ok,
  };
}

export async function executeApprovedDeploy(projectId: string, target: DeploymentTarget) {
  return deployProject(projectId, target);
}
