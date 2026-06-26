import { NextResponse } from "next/server";
import { getConfig, hasOpenAI } from "@/lib/support/config";
import { getSession, saveSession } from "@/lib/support/investigation/session-store";
import { runInvestigationChat } from "@/lib/support/agents/orchestratorAgent";
import type { InvestigationChatMessage } from "@/lib/support/investigation/types";
import { streamChatText, simulateStream } from "@/lib/support/openai-stream";
import { encodeSseEvent } from "@/lib/support/chat/stream-events";
import { isTestMode } from "@/lib/test-mode";
import { redact } from "@/lib/support/redact";

export const runtime = "nodejs";
export const maxDuration = 120;

interface StreamBody {
  sessionId?: string;
  message: string;
  investigationId?: string;
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

        const toolId = crypto.randomUUID();
        send({
          type: "tool_call_start",
          toolCallId: toolId,
          agent: "support",
          name: "investigate_context",
          summary: "Searching investigation evidence…",
        });

        let fullText = "";

        if (isTestMode()) {
          fullText =
            "Based on the investigation evidence, the bulk tag API likely fails due to a missing required field in the payload. Check `name` and `type` fields per API docs.";
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
        } else if (body.sessionId) {
          const ctx = await getSession(body.sessionId);
          if (!ctx) throw new Error("Investigation session not found");

          send({ type: "tool_call_update", toolCallId: toolId, status: "running" });

          const cfg = getConfig();
          const evidenceBlock = ctx.evidence
            .slice(0, 20)
            .map((e) => `[${e.sourceType}] ${e.title}: ${e.summary}`)
            .join("\n");

          if (hasOpenAI(cfg) && cfg.openaiApiKey) {
            const messages = [
              {
                role: "system" as const,
                content:
                  "You are a support engineering copilot. Answer ONLY from investigation evidence. Be concise. No hidden reasoning.",
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
            const { reply } = await runInvestigationChat(body.sessionId, message);
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
        } else {
          fullText =
            "Start an investigation first, then I can answer follow-ups with streaming evidence-backed replies.";
          for await (const chunk of simulateStream(fullText)) {
            send({ type: "token", messageId, text: chunk });
          }
          send({
            type: "tool_call_result",
            toolCallId: toolId,
            status: "skipped",
            summary: "No active session",
          });
        }

        if (body.investigationId) {
          send({
            type: "investigation_update",
            investigationId: body.investigationId,
            patch: { updatedAt: new Date().toISOString() },
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
