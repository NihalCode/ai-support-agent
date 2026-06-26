import "server-only";

import { enqueueApproval } from "@/lib/support/approvals";
import { classifyAction } from "@/lib/support/safety";
import type { BuildAppRequest } from "./types";
import { runAppBuilderAgent, isBuildAppMessage } from "./appBuilderAgent";
import { runAppDeployAgent, executeApprovedDeploy } from "./appDeployAgent";
import { applyFileChanges, getProject } from "./project-store";
import { isDeployRequest } from "./classify-request";
import type { DeploymentTarget } from "./types";
import type { BuildAppCredentials } from "./credentials";

export function routeBuildAppRequest(req: BuildAppRequest) {
  if (req.projectId && isDeployRequest(req.message)) {
    return { agent: "appDeploy" as const, req };
  }
  if (isBuildAppMessage(req.message) || req.projectId) {
    return { agent: "appBuilder" as const, req };
  }
  return null;
}

export function handleBuildAppPlan(req: BuildAppRequest) {
  return runAppBuilderAgent(req);
}

export async function handleBuildAppDeploy(
  projectId: string,
  target: DeploymentTarget = "preview",
  credentials?: BuildAppCredentials
) {
  return runAppDeployAgent(projectId, target, credentials);
}

export function requestScaffoldApproval(projectId: string, preview: string) {
  const safety = classifyAction({
    kind: "api",
    method: "POST",
    summary: `Scaffold build-app project ${projectId}`,
  });
  return enqueueApproval({
    action: { type: "build-app-scaffold", projectId },
    safety,
    preview,
  });
}

export function requestWriteApproval(projectId: string, paths: string[], preview: string) {
  const safety = classifyAction({
    kind: "api",
    method: "PUT",
    summary: `Write ${paths.length} files in build-app project ${projectId}`,
  });
  return enqueueApproval({
    action: { type: "build-app-write", projectId, paths },
    safety,
    preview,
  });
}

export function requestDeployApproval(projectId: string, target: DeploymentTarget, preview: string) {
  const safety = classifyAction({
    kind: "api",
    method: "POST",
    summary: `Deploy build-app project ${projectId} to ${target}`,
  });
  return enqueueApproval({
    action: { type: "build-app-deploy", projectId, target },
    safety,
    preview,
  });
}

export async function applyApprovedBuildAction(
  action: { type: string; projectId: string; target?: DeploymentTarget },
  credentials?: BuildAppCredentials
): Promise<string> {
  const project = getProject(action.projectId);
  if (!project) throw new Error("Project not found");

  if (action.type === "build-app-scaffold" || action.type === "build-app-write") {
    applyFileChanges(action.projectId, project.pendingChanges);
    return `Applied ${project.pendingChanges.length} file(s) to ${project.name}.`;
  }

  if (action.type === "build-app-deploy") {
    const dep = await executeApprovedDeploy(action.projectId, action.target ?? "preview", credentials);
    return dep.mock
      ? `Mock deployment ready: ${dep.url} (not a real Vercel URL)`
      : `Deployed to ${dep.url}`;
  }

  throw new Error(`Unknown build-app action: ${action.type}`);
}
