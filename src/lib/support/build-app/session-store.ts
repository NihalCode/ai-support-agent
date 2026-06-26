import "server-only";

import { getProject, saveProject } from "./project-store";
import { sessionFromProject, type AppBuilderSession } from "./session-state";

export function loadAppBuilderSession(
  projectId: string | undefined,
  opts?: { awaitingApproval?: boolean }
): AppBuilderSession | null {
  if (!projectId) return null;
  const project = getProject(projectId);
  if (!project) return null;
  return sessionFromProject(project, opts);
}

export function touchSessionRequest(projectId: string, message: string): void {
  const project = getProject(projectId);
  if (!project) return;
  if (!project.description || project.status === "planning") {
    project.description = message;
  }
  saveProject(project);
}
