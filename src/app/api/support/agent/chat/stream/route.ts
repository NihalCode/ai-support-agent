import { NextResponse } from "next/server";
import { getConfig, hasOpenAI } from "@/lib/support/config";
import { getSession, saveSession } from "@/lib/support/investigation/session-store";
import { runInvestigationChat } from "@/lib/support/agents/orchestratorAgent";
import type { InvestigationChatMessage } from "@/lib/support/investigation/types";
import { streamChatText, simulateStream } from "@/lib/support/openai-stream";
import { encodeSseEvent } from "@/lib/support/chat/stream-events";
import { isTestMode } from "@/lib/test-mode";
import { redact } from "@/lib/support/redact";
import {
  ensureInvestigationSession,
  isSupportLikeMessage,
} from "@/lib/support/investigation/ensure-investigation";
import { extractNaturalLanguageDetails } from "@/lib/support/investigation/extract-query";
import { shouldRouteToBuildApp } from "@/lib/support/build-app/chat-routing";
import { streamBuildAppHandoffFromChat } from "@/lib/support/build-app/chat-stream";

export const runtime = "nodejs";
export const maxDuration = 120;

interface StreamBody {
  sessionId?: string;
  message: string;
  investigationId?: string;
  buildProjectId?: string;
}

function investigationTitle(message: string): string {
  const details = extractNaturalLanguageDetails(message);
  if (details.workflowName) return `${details.workflowName} — support issue`;
  if (details.supportTicketId) return `Ticket ${details.supportTicketId} investigation`;
  return message.slice(0, 72).trim() + (message.length > 72 ? "…" : "");
}

export async function POST(req: Request) {
  let body: StreamBody;
  try {
    body = (await req.json()) as StreamBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });

  const messageId = crypto.randomUUID();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Parameters<typeof encodeSseEvent>[0]) => {
        controller.enqueue(encoder.encode(encodeSseEvent(event)));
      };

      try {
        send({ type: "message_start", messageId });

        let fullText = "";
        let sessionId = body.sessionId;
        let investigationId = body.investigationId;
        let buildProjectId = body.buildProjectId;

        if (
          shouldRouteToBuildApp(message, {
            buildProjectId,
            sessionId,
          })
        ) {
          const build = await streamBuildAppHandoffFromChat({
            message,
            projectId: buildProjectId,
            messageId,
            send,
          });
          fullText = build.fullText;
        } else if (!sessionId && isSupportLikeMessage(message)) {
          const createToolId = crypto.randomUUID();
          send({
            type: "tool_call_start",
            toolCallId: createToolId,
            agent: "support",
            name: "create_investigation",
            summary: "Starting investigation from your description…",
          });

          const auto = await ensureInvestigationSession({
            userMessage: message,
            currentSessionId: sessionId,
            currentInvestigationId: investigationId,
          });

          sessionId = auto.sessionId;
          investigationId = auto.investigationId ?? investigationId;

          send({
            type: "tool_call_result",
            toolCallId: createToolId,
            status: "success",
            summary: `Started investigation: ${auto.report.title || investigationTitle(message)}`,
          });

          send({
            type: "session_created",
            sessionId,
            investigationId,
            title: auto.report.title || investigationTitle(message),
          });

          const toolId = crypto.randomUUID();
          send({
            type: "tool_call_start",
            toolCallId: toolId,
            agent: "support",
            name: "investigate_context",
            summary: "Extracting issue details and checking available evidence…",
          });
          send({ type: "tool_call_update", toolCallId: toolId, status: "running" });

          fullText = auto.introMarkdown;
          for await (const chunk of simulateStream(fullText)) {
            send({ type: "token", messageId, text: chunk });
          }

          send({
            type: "tool_call_result",
            toolCallId: toolId,
            status: "success",
            summary: "Checked docs, Jira, logs, and code where available",
          });
        } else if (sessionId) {
          const toolId = crypto.randomUUID();
          send({
            type: "tool_call_start",
            toolCallId: toolId,
            agent: "support",
            name: "investigate_context",
            summary: "Searching investigation evidence…",
          });

          const ctx = await getSession(sessionId);
          if (!ctx) throw new Error("Investigation session not found");

          send({ type: "tool_call_update", toolCallId: toolId, status: "running" });

          const cfg = getConfig();
          const evidenceBlock = ctx.evidence
            .slice(0, 20)
            .map((e) => `[${e.sourceType}] ${e.title}: ${e.summary}`)
            .join("\n");

          if (hasOpenAI(cfg) && cfg.openaiApiKey && !isTestMode()) {
            const messages = [
              {
                role: "system" as const,
                content:
                  "You are a support engineering copilot. Answer ONLY from investigation evidence. Use plain English unless the user is clearly technical. Be concise. No hidden reasoning.",
              },
              {
                role: "user" as const,
                content: `EVIDENCE:\n${evidenceBlock}\n\nQUESTION:\n${message}`,
              },
            ];
            for await (const chunk of streamChatText(messages, cfg.openaiApiKey)) {
              fullText += chunk;
              send({ type: "token", messageId, text: chunk });
            }
            const userMsg: InvestigationChatMessage = {
              role: "user",
              content: message,
              at: new Date().toISOString(),
            };
            ctx.chatHistory.push(userMsg);
            ctx.chatHistory.push({
              role: "assistant",
              content: fullText,
              at: new Date().toISOString(),
            });
            ctx.updatedAt = new Date().toISOString();
            await saveSession(ctx);
          } else {
            const { reply } = await runInvestigationChat(sessionId, message);
            fullText = reply;
            for await (const chunk of simulateStream(fullText)) {
              send({ type: "token", messageId, text: chunk });
            }
          }

          send({
            type: "tool_call_result",
            toolCallId: toolId,
            status: "success",
            summary: "Used investigation evidence",
          });
        } else if (isTestMode()) {
          const toolId = crypto.randomUUID();
          send({
            type: "tool_call_start",
            toolCallId: toolId,
            agent: "support",
            name: "investigate_context",
            summary: "Extracting issue details and checking available evidence…",
          });
          fullText =
            "I'll investigate this from what you provided. Based on prior evidence, the bulk tag API likely fails due to a missing required field in the payload.";
          send({ type: "tool_call_update", toolCallId: toolId, status: "running" });
          for await (const chunk of simulateStream(fullText)) {
            send({ type: "token", messageId, text: chunk });
          }
          send({
            type: "tool_call_result",
            toolCallId: toolId,
            status: "success",
            summary: "Reviewed API docs and prior evidence (test mode)",
          });
        } else {
          fullText =
            "Tell me a bit more about the problem — for example what you were trying to do, when it started, and any ticket number you have. I'll start an investigation automatically.";
          for await (const chunk of simulateStream(fullText)) {
            send({ type: "token", messageId, text: chunk });
          }
        }

        if (buildProjectId) {
          send({
            type: "build_app_updated",
            projectId: buildProjectId,
            patch: { updatedAt: new Date().toISOString() },
          });
        }

        if (investigationId) {
          send({
            type: "investigation_update",
            investigationId,
            patch: { updatedAt: new Date().toISOString(), sessionId },
          });
        }

        send({ type: "message_done", messageId });
      } catch (err) {
        send({
          type: "error",
          messageId,
          error: redact(err instanceof Error ? err.message : "Stream failed"),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
