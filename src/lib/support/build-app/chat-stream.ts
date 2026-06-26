import "server-only";

import type { ChatStreamEvent } from "@/lib/support/chat/stream-events";
import { simulateStream } from "@/lib/support/openai-stream";
import { extractBuildAppHandoff } from "./handoff";
import type { IntentClassification } from "../intent/types";
import { formatIntentSummary } from "../intent/classify-intent";

type SendFn = (event: ChatStreamEvent) => void;

export interface BuildAppChatStreamResult {
  fullText: string;
}

/** Route build-app chat to the Build App workspace with pre-filled context — planning runs client-side. */
export async function streamBuildAppHandoffFromChat(input: {
  message: string;
  projectId?: string;
  buildOk?: boolean | null;
  messageId: string;
  send: SendFn;
  classification?: IntentClassification;
}): Promise<BuildAppChatStreamResult> {
  const { message, projectId, buildOk, messageId, send, classification } = input;
  const handoff = extractBuildAppHandoff(message, { buildProjectId: projectId, buildOk });

  const toolId = crypto.randomUUID();
  send({
    type: "tool_call_start",
    toolCallId: toolId,
    agent: "appBuilder",
    name: "open_build_app",
    summary:
      handoff.mode === "deploy"
        ? "Preparing preview deployment…"
        : handoff.mode === "edit"
          ? "Updating your app from your request…"
          : "Creating your app plan…",
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
    autoStart: true,
  });

  const templateLabel = handoff.templateId.replace(/-/g, " ");
  const ticketLine = handoff.ticketId ? `\nLinked ticket: **${handoff.ticketId}**` : "";
  const intentBlock = classification
    ? `\n\n${formatIntentSummary(classification)}`
    : handoff.intentSummary
      ? `\n\nPlan: ${handoff.intentSummary}`
      : "";

  const modeIntro =
    handoff.mode === "deploy"
      ? "Got it — I'll check the build and prepare a preview link you can share."
      : handoff.mode === "edit"
        ? "Understood — I'll update the current app, show you the diff, and run the build."
        : "I'll scaffold a new app from your description — review the plan and approve when ready.";

  const fullText = [
    modeIntro,
    intentBlock,
    "",
    `Suggested template: **${templateLabel}** (${handoff.templateReason})${ticketLine}`,
    "",
    "Opening **Build App** with your request pre-filled.",
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
        ? "Opened Build App for preview/deploy"
        : handoff.mode === "edit"
          ? "Opened Build App for edits"
          : `Opened Build App (${handoff.templateId})`,
  });

  return { fullText };
}
