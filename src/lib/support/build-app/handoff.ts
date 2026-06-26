import { selectTemplate, isDeployRequest } from "./classify-request";

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
}

export function extractBuildAppHandoff(
  message: string,
  opts: { buildProjectId?: string | null } = {}
): BuildAppHandoff {
  const { templateId, reason } = selectTemplate(message);
  const ticketId = message.match(TICKET_RE)?.[1];
  const title =
    message.slice(0, 72).trim() + (message.length > 72 ? "…" : "") || "Build App";

  let mode: BuildAppHandoffMode = "plan";
  if (opts.buildProjectId) {
    mode = isDeployRequest(message) ? "deploy" : "edit";
  }

  return {
    description: message,
    title,
    templateId,
    templateReason: reason,
    ticketId,
    projectId: opts.buildProjectId ?? undefined,
    mode,
    autoStart: true,
  };
}
