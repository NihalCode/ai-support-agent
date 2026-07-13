import { NextResponse } from "next/server";
import { requireSupportApi, SupportApiPermission } from "@/lib/auth/support-api-auth";
import { getConfig, hasOpenAI } from "@/lib/support/config";
import { getSession, saveSession } from "@/lib/support/investigation/session-store";
import { runInvestigationChat } from "@/lib/support/agents/orchestratorAgent";
import type { InvestigationChatMessage } from "@/lib/support/investigation/types";
import { streamChatText, simulateStream } from "@/lib/support/openai-stream";
import { encodeSseEvent } from "@/lib/support/chat/stream-events";
import { isTestMode } from "@/lib/test-mode";
import { redact } from "@/lib/support/redact";
import { UNSUPPORTED_APP_BUILD_MESSAGE } from "@/lib/support/unsupported-app-build";
import {
  ensureInvestigationSession,
} from "@/lib/support/investigation/ensure-investigation";
import { extractNaturalLanguageDetails } from "@/lib/support/investigation/extract-query";
import { formatIntentSummary } from "@/lib/support/intent/classify-intent";
import {
  chooseAgentRoute,
  buildClarificationReply,
} from "@/lib/support/intent/choose-route";
import type { WorkspaceIntentContext } from "@/lib/support/intent/types";
import { buildCqlMarkdownReply } from "@/lib/support/investigation/cql-investigation";
import {
  classifyWithAttachments,
  normalizeChatMode,
} from "@/agent/UnifiedChatOrchestrator";
import type { ChatMode } from "@/agent/types";
import { metrics } from "@/metrics/MetricsService";
import { buildApiTroubleshootingMarkdown, API_TROUBLESHOOTING_SYSTEM_PROMPT } from "@/lib/support/api-troubleshooting";
import {
  DEVELOPER_HANDOFF_SYSTEM_PROMPT,
  formatDeveloperHandoff,
  userExplicitlyAskedForCommits,
} from "@/lib/support/developer-handoff";
import {
  formatZendeskResearchResponse,
  researchZendeskTickets,
} from "@/lib/support/enterprise/zendesk-ticket-research";

export const runtime = "nodejs";
export const maxDuration = 120;

interface StreamBody {
  sessionId?: string;
  message: string;
  investigationId?: string;
  buildProjectId?: string;
  buildOk?: boolean | null;
  chatMode?: ChatMode;
  attachmentIds?: string[];
  conversationId?: string;
  canUseDeveloperMode?: boolean;
}

function investigationTitle(message: string): string {
  const details = extractNaturalLanguageDetails(message);
  if (details.workflowName) return `${details.workflowName} — support issue`;
  if (details.supportTicketId) return `Ticket ${details.supportTicketId} investigation`;
  return message.slice(0, 72).trim() + (message.length > 72 ? "…" : "");
}

export async function POST(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.read, req);
  if (auth instanceof NextResponse) return auth;

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
  const streamStarted = Date.now();

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
        const buildProjectId = body.buildProjectId;

        const intentCtx: WorkspaceIntentContext = {
          sessionId,
          investigationId,
          buildProjectId,
          buildOk: body.buildOk,
          buildFailed: body.buildOk === false,
        };

        const chatMode = normalizeChatMode(
          body.chatMode,
          body.canUseDeveloperMode ?? true
        );

        const { classification, enrichedMessage } = classifyWithAttachments({
          message,
          context: intentCtx,
          attachmentIds: body.attachmentIds ?? [],
          chatMode,
        });
        const route = chooseAgentRoute(classification, intentCtx, enrichedMessage);

        send({
          type: "intent_classified",
          messageId,
          primaryIntent: classification.primaryIntent,
          confidence: classification.confidence,
          summary: formatIntentSummary(classification),
          recommendedRoute: classification.recommendedRoute,
        });

        if (route.kind === "unsupported_app_build") {
          fullText = UNSUPPORTED_APP_BUILD_MESSAGE;
          for await (const chunk of simulateStream(fullText)) {
            send({ type: "token", messageId, text: chunk });
          }
        } else if (
          classification.primaryIntent === "support.ticket_research" &&
          classification.provider === "zendesk"
        ) {
          const phases = [
            ["zendesk_readiness", "Checking Zendesk connection"],
            ["zendesk_search", "Searching historical tickets"],
            ["zendesk_rerank", "Reviewing relevant cases"],
            ["zendesk_summary", "Summarizing previous resolutions"],
          ] as const;
          const toolIds = phases.map(() => crypto.randomUUID());
          phases.forEach(([name, summary], index) => {
            send({
              type: "tool_call_start",
              toolCallId: toolIds[index],
              agent: "zendesk",
              name,
              summary,
            });
          });

          const result = await researchZendeskTickets(message, 5, auth.user.orgId);
          phases.forEach(([, summary], index) => {
            send({
              type: "tool_call_result",
              toolCallId: toolIds[index],
              status:
                index > 0 &&
                (!result.status.connected ||
                  result.status.syncState === "failed" ||
                  result.status.syncState === "never_synced")
                  ? "skipped"
                  : "success",
              summary,
            });
          });

          fullText = formatZendeskResearchResponse(result);
          for await (const chunk of simulateStream(fullText)) {
            send({ type: "token", messageId, text: chunk });
          }

          void metrics.track({
            eventType:
              result.matches.length > 0
                ? "zendesk.search.completed"
                : "zendesk.search.zero_results",
            category: "integration",
            actorUserId: auth.user.id,
            actorRole: auth.user.role,
            durationMs: result.durationMs,
            metadata: {
              messageId,
              traceId: result.traceId,
              integrationId: result.status.integrationId,
              organizationId: result.status.organizationId,
              resultCount: result.matches.length,
              syncState: result.status.syncState,
            },
          });
        } else if (route.kind === "api_troubleshooting") {
          const createToolId = crypto.randomUUID();
          send({
            type: "tool_call_start",
            toolCallId: createToolId,
            agent: "support",
            name: "api_troubleshoot",
            summary: "Analyzing API error and endpoint context…",
          });

          const auto = await ensureInvestigationSession({
            userMessage: message,
            currentSessionId: sessionId,
            currentInvestigationId: investigationId,
          });
          sessionId = auto.sessionId;
          investigationId = auto.investigationId ?? investigationId;

          fullText = buildApiTroubleshootingMarkdown({
            message,
            entities: classification.extractedEntities,
          });

          if (hasOpenAI(getConfig()) && getConfig().openaiApiKey && !isTestMode()) {
            const cfg = getConfig();
            const evidenceBlock = auto.report
              ? JSON.stringify(auto.report.whatWeFound ?? {}, null, 0).slice(0, 2000)
              : "";
            const messages = [
              { role: "system" as const, content: API_TROUBLESHOOTING_SYSTEM_PROMPT },
              {
                role: "user" as const,
                content: `USER ISSUE:\n${message}\n\nEXTRACTED:\n${JSON.stringify(classification.extractedEntities)}\n\nEVIDENCE:\n${evidenceBlock}\n\nUse the troubleshooting structure from the template.`,
              },
            ];
            let llmText = "";
            for await (const chunk of streamChatText(messages, cfg.openaiApiKey!)) {
              llmText += chunk;
              send({ type: "token", messageId, text: chunk });
            }
            if (llmText.trim()) fullText = llmText;
          } else {
            for await (const chunk of simulateStream(fullText)) {
              send({ type: "token", messageId, text: chunk });
            }
          }

          send({
            type: "tool_call_result",
            toolCallId: createToolId,
            status: "success",
            summary: "Generated API troubleshooting guidance",
          });

          if (sessionId) {
            send({
              type: "session_created",
              sessionId,
              investigationId,
              title: investigationTitle(message),
            });
          }
        } else if (route.kind === "investigation_create") {
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
        } else if (
          route.kind === "investigation_customer_response" ||
          route.kind === "investigation_developer_handoff" ||
          route.kind === "investigation_chat" ||
          sessionId
        ) {
          if (!sessionId) {
            const auto = await ensureInvestigationSession({
              userMessage: message,
              currentSessionId: sessionId,
              currentInvestigationId: investigationId,
            });
            sessionId = auto.sessionId;
            investigationId = auto.investigationId ?? investigationId;
            send({
              type: "session_created",
              sessionId,
              investigationId,
              title: auto.report.title || investigationTitle(message),
            });
          }

          const toolId = crypto.randomUUID();
          send({
            type: "tool_call_start",
            toolCallId: toolId,
            agent: "support",
            name: "investigate_context",
            summary: "Searching investigation evidence…",
          });

          const ctx = await getSession(sessionId!);
          if (!ctx) {
            fullText =
              route.kind === "investigation_developer_handoff"
                ? formatDeveloperHandoff({
                    message,
                    entities: classification.extractedEntities,
                    includeCommits: userExplicitlyAskedForCommits(message),
                  })
                : buildApiTroubleshootingMarkdown({ message, entities: classification.extractedEntities });
            for await (const chunk of simulateStream(fullText)) {
              send({ type: "token", messageId, text: chunk });
            }
            send({
              type: "tool_call_result",
              toolCallId: toolId,
              status: "success",
              summary: "Created handoff from conversation context",
            });
          } else {
          send({ type: "tool_call_update", toolCallId: toolId, status: "running" });

          const cfg = getConfig();
          const evidenceBlock = ctx.evidence
            .slice(0, 20)
            .map((e) => `[${e.sourceType}] ${e.title}: ${e.summary}`)
            .join("\n");

          let systemPrompt =
            "You are a support engineering copilot. Answer ONLY from investigation evidence. Use plain English unless the user is clearly technical. Be concise. No hidden reasoning. Do NOT discuss latest commits or git history unless the user explicitly asked.";
          if (route.kind === "investigation_customer_response") {
            systemPrompt +=
              " The user wants a customer-facing reply. Write what they can send to the customer — professional, empathetic, no internal jargon.";
          } else if (route.kind === "investigation_developer_handoff") {
            systemPrompt += ` ${DEVELOPER_HANDOFF_SYSTEM_PROMPT}`;
          } else if (route.investigationPromptHint) {
            systemPrompt += ` ${route.investigationPromptHint}`;
          }

          if (hasOpenAI(cfg) && cfg.openaiApiKey && !isTestMode()) {
            const messages = [
              { role: "system" as const, content: systemPrompt },
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
          } else if (route.kind === "investigation_developer_handoff") {
            fullText = formatDeveloperHandoff({
              message,
              entities: classification.extractedEntities,
              evidenceSummary: evidenceBlock,
              likelyCause: ctx.rootCause?.likelyCause,
              confidence: ctx.rootCause?.confidence,
              includeCommits: userExplicitlyAskedForCommits(message),
            });
            for await (const chunk of simulateStream(fullText)) {
              send({ type: "token", messageId, text: chunk });
            }
          } else {
            const { reply } = await runInvestigationChat(sessionId!, message);
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
          }
        } else if (route.kind === "clarify") {
          fullText = buildClarificationReply(classification);
          // Intent summary already streamed via intent_classified — avoid duplicate token stream.
        } else if (route.kind === "cql") {
          const createToolId = crypto.randomUUID();
          send({
            type: "tool_call_start",
            toolCallId: createToolId,
            agent: "cql",
            name: "generate_cql",
            summary: "Generating CQL query and fetching grammar docs…",
          });

          const auto = await ensureInvestigationSession({
            userMessage: message,
            currentSessionId: sessionId,
            currentInvestigationId: investigationId,
          });

          sessionId = auto.sessionId;
          investigationId = auto.investigationId ?? investigationId;
          fullText = auto.introMarkdown || (await buildCqlMarkdownReply(message));

          send({
            type: "tool_call_result",
            toolCallId: createToolId,
            status: "success",
            summary: "Generated CQL query with grammar doc links",
          });

          if (sessionId) {
            send({
              type: "session_created",
              sessionId,
              investigationId,
              title: "CQL query help",
            });
          }

          for await (const chunk of simulateStream(fullText)) {
            send({ type: "token", messageId, text: chunk });
          }
        } else if (route.kind === "api") {
          fullText =
            "I'll help with the API request — open **API Registry** or the API runner, or continue here with more detail about the endpoint you need.\n\n" +
            formatIntentSummary(classification);
          for await (const chunk of simulateStream(fullText)) {
            send({ type: "token", messageId, text: chunk });
          }
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

        if (investigationId) {
          send({
            type: "investigation_update",
            investigationId,
            patch: { updatedAt: new Date().toISOString(), sessionId },
          });
        }

        send({ type: "message_done", messageId });

        const draftEventType =
          route.kind === "investigation_customer_response"
            ? "draft.customer_response"
            : route.kind === "investigation_developer_handoff"
              ? "draft.developer_handoff"
              : "chat.stream";

        void metrics.track({
          eventType: draftEventType,
          category: draftEventType.startsWith("draft.") ? "draft" : "chat",
          actorUserId: auth.user.id,
          actorRole: auth.user.role,
          durationMs: Date.now() - streamStarted,
          metadata: {
            messageId,
            sessionId,
            investigationId,
            routeKind: route.kind,
          },
        });
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
