import type { BuildAppRequest } from "./types";
import {
  classifyUserIntent,
  shouldRouteToBuildAppFromIntent,
} from "../intent/classify-intent";
import type { WorkspaceIntentContext } from "../intent/types";

/** Whether the main AI chat should route to Build App instead of investigation. */
export function shouldRouteToBuildApp(
  message: string,
  opts: { buildProjectId?: string | null; sessionId?: string | null; buildOk?: boolean | null } = {}
): boolean {
  const ctx: WorkspaceIntentContext = {
    buildProjectId: opts.buildProjectId,
    sessionId: opts.sessionId,
    buildOk: opts.buildOk,
    buildFailed: opts.buildOk === false,
  };
  const classification = classifyUserIntent({ message, context: ctx });
  return shouldRouteToBuildAppFromIntent(classification, ctx);
}

export function buildAppChatRequest(message: string, projectId?: string | null): BuildAppRequest {
  return {
    message,
    projectId: projectId ?? undefined,
  };
}
