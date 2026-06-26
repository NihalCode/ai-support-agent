import "server-only";

import { execSync } from "node:child_process";
import { isTestMode } from "@/lib/test-mode";
import { getProject, saveProject } from "./project-store";

export async function commitBuildAppProject(
  projectId: string,
  message: string,
  branch?: string
): Promise<string> {
  const p = getProject(projectId);
  if (!p) throw new Error("Project not found");

  if (isTestMode() || !process.env.GITHUB_TOKEN) {
    p.lastCommit = `[mock] ${message}`;
    p.gitBranch = branch ?? "feature/build-app";
    saveProject(p);
    return `[mock] Committed on branch ${p.gitBranch}: ${message}`;
  }

  try {
    if (branch) {
      execSync(`git checkout -b ${branch}`, { cwd: p.rootDir, stdio: "pipe" });
    }
    execSync("git add -A", { cwd: p.rootDir, stdio: "pipe" });
    execSync(`git commit -m ${JSON.stringify(message)}`, { cwd: p.rootDir, stdio: "pipe" });
    p.lastCommit = message;
    p.gitBranch = branch;
    saveProject(p);
    return `Committed: ${message}`;
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "Git commit failed");
  }
}
