import type { BuildAppRequest } from "./types";
import { isBuildAppRequest, isDeployRequest } from "./classify-request";

/** Whether the main AI chat should route to Build App instead of investigation. */
export function shouldRouteToBuildApp(
  message: string,
  opts: { buildProjectId?: string | null; sessionId?: string | null } = {}
): boolean {
  const { buildProjectId, sessionId } = opts;

  if (buildProjectId) {
    if (isDeployRequest(message)) return true;
    if (isBuildAppRequest(message)) return true;
    if (/\b(edit|fix|cleaner|filter|explain|add |make |update|change|ui|look)\b/i.test(message)) {
      return true;
    }
    return false;
  }

  if (isBuildAppRequest(message)) return true;

  // Deploy without an active project — still route to build app (will prompt to scaffold first)
  if (isDeployRequest(message) && !sessionId) return true;

  return false;
}

export function buildAppChatRequest(message: string, projectId?: string | null): BuildAppRequest {
  return {
    message,
    projectId: projectId ?? undefined,
  };
}
