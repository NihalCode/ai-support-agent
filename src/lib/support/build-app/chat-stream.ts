import "server-only";

import type { ChatStreamEvent } from "@/lib/support/chat/stream-events";
import { simulateStream } from "@/lib/support/openai-stream";
import { extractBuildAppHandoff } from "./handoff";

type SendFn = (event: ChatStreamEvent) => void;

export interface BuildAppChatStreamResult {
  fullText: string;
}

/** Route build-app chat to the Build App workspace with pre-filled context — planning runs client-side. */
export async function streamBuildAppHandoffFromChat(input: {
  message: string;
  projectId?: string;
  messageId: string;
  send: SendFn;
}): Promise<BuildAppChatStreamResult> {
  const { message, projectId, messageId, send } = input;
  const handoff = extractBuildAppHandoff(message, { buildProjectId: projectId });

  const toolId = crypto.randomUUID();
  send({
    type: "tool_call_start",
    toolCallId: toolId,
    agent: "appBuilder",
    name: "open_build_app",
    summary:
      handoff.mode === "deploy"
        ? "Opening Build App to deploy your project…"
        : handoff.mode === "edit"
          ? "Opening Build App with your edit request…"
          : "Opening Build App with your app description…",
  });

  send({
    type: "build_app_handoff",
    title: handoff.title,
    description: handoff.description,
    templateId: handoff.templateId,
    templateReason: handoff.templateReason,
    ticketId: handoff.ticketId,
    projectId: handoff.projectId,
    mode: handoff.mode,
    autoStart: handoff.autoStart,
  });

  const templateLabel = handoff.templateId.replace(/-/g, " ");
  const ticketLine = handoff.ticketId ? `\nLinked ticket: **${handoff.ticketId}**` : "";
  const fullText = [
    handoff.mode === "deploy"
      ? "Opening **Build App** to run your deployment — review the build output there."
      : handoff.mode === "edit"
        ? "Opening **Build App** with your change request — I'll propose edits in the workspace."
        : "Opening **Build App** with your description — I'll pick a starting template and generate a scaffold plan there.",
    "",
    `Suggested template: **${templateLabel}** (${handoff.templateReason})${ticketLine}`,
    "",
    "The description and any detected fields are pre-filled in the Build App workspace. Planning starts automatically.",
  ].join("\n");

  send({ type: "tool_call_update", toolCallId: toolId, status: "running" });
  for await (const chunk of simulateStream(fullText)) {
    send({ type: "token", messageId, text: chunk });
  }

  send({
    type: "tool_call_result",
    toolCallId: toolId,
    status: "success",
    summary:
      handoff.mode === "deploy"
        ? "Opened Build App for deployment"
        : handoff.mode === "edit"
          ? "Opened Build App for edits"
          : `Opened Build App (${handoff.templateId})`,
  });

  return { fullText };
}
