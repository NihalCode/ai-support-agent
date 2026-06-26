import "server-only";

import { isTestMode } from "@/lib/test-mode";
import { getProject, saveProject } from "./project-store";
import type { BuildAppCredentials } from "./credentials";
import { hasGitHubPushCredentials, resolveBuildAppCredentials } from "./credentials";
import { pushProjectToGitHub } from "./github-api-push";

export async function commitBuildAppProject(
  projectId: string,
  message: string,
  branch?: string,
  credentials?: BuildAppCredentials
): Promise<string> {
  const p = getProject(projectId);
  if (!p) throw new Error("Project not found");

  const resolved = resolveBuildAppCredentials(credentials);

  if (isTestMode() || !hasGitHubPushCredentials(resolved)) {
    p.lastCommit = `[mock] ${message}`;
    p.gitBranch = branch ?? "feature/build-app";
    saveProject(p);
    if (!hasGitHubPushCredentials(resolved)) {
      return `[mock] Committed on branch ${p.gitBranch}: ${message} — paste GitHub token + repo for a real push.`;
    }
    return `[mock] Committed on branch ${p.gitBranch}: ${message}`;
  }

  const push = await pushProjectToGitHub({
    token: resolved.githubToken!,
    repo: resolved.githubRepo!,
    rootDir: p.rootDir,
    message,
    branch: branch ?? resolved.githubBranch ?? undefined,
  });
  p.lastCommit = push.commitSha;
  p.gitBranch = push.branch;
  saveProject(p);
  return `Pushed to GitHub: ${push.url} (${push.commitSha.slice(0, 7)})`;
}
