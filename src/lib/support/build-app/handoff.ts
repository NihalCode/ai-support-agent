import { selectTemplate } from "./classify-request";
import { buildAppModeFromIntent, classifyUserIntent } from "../intent/classify-intent";
import type { WorkspaceIntentContext } from "../intent/types";

const TICKET_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/;

export type BuildAppHandoffMode = "plan" | "edit" | "deploy";

export interface BuildAppHandoff {
  description: string;
  title: string;
  templateId: string;
  templateReason: string;
  ticketId?: string;
  projectId?: string;
  mode: BuildAppHandoffMode;
  autoStart: boolean;
  intentSummary?: string;
}

export function extractBuildAppHandoff(
  message: string,
  opts: { buildProjectId?: string | null; buildOk?: boolean | null } = {}
): BuildAppHandoff {
  const { templateId, reason } = selectTemplate(message);
  const ticketId = message.match(TICKET_RE)?.[1];
  const title =
    message.slice(0, 72).trim() + (message.length > 72 ? "…" : "") || "Build App";

  const ctx: WorkspaceIntentContext = {
    buildProjectId: opts.buildProjectId,
    buildOk: opts.buildOk,
    buildFailed: opts.buildOk === false,
  };
  const classification = classifyUserIntent({ message, context: ctx });
  const mode = buildAppModeFromIntent(classification, Boolean(opts.buildProjectId));

  return {
    description: message,
    title,
    templateId,
    templateReason: reason,
    ticketId,
    projectId: opts.buildProjectId ?? undefined,
    mode,
    autoStart: true,
    intentSummary: classification.planSummary,
  };
}
