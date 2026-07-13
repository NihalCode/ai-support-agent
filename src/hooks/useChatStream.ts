"use client";

import { useCallback, useRef } from "react";
import type { ChatStreamEvent } from "@/lib/support/chat/stream-events";
import { applyChatContentEvent } from "@/lib/support/chat/stream-content";
import { shouldFallbackToInvestigate } from "@/lib/support/chat/stream-fallback";
import { useWorkspace } from "@/components/ide/WorkspaceProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import type { ChatMessageMeta, ToolCallCardState } from "@/components/ide/types";

export function useChatStream() {
  const {
    state,
    addChatMessage,
    updateChatMessage,
    setInvestigationSession,
    setActiveInvestigation,
    openTab,
  } = useWorkspace();
  const { canUseDeveloperMode } = useAuth();

  const sendingRef = useRef(false);

  const sendStream = useCallback(
    async (
      text: string,
      opts?: {
        onStreamingChange?: (v: boolean) => void;
        signal?: AbortSignal;
        attachmentIds?: string[];
      }
    ) => {
      if (sendingRef.current) return null;
      sendingRef.current = true;
      opts?.onStreamingChange?.(true);

      const attachmentIds = opts?.attachmentIds ?? [];
      const attachmentMeta = state.conversationAttachments
        .filter((a) => attachmentIds.includes(a.id))
        .map((a) => ({
          filename: a.filename,
          summary: a.summary,
          detectedType: a.detectedType,
        }));

      const userId = addChatMessage({
        role: "user",
        content: text,
        meta: attachmentMeta.length ? { attachmentIds, attachments: attachmentMeta } : undefined,
      });
      const assistantId = addChatMessage({
        role: "assistant",
        content: "",
        toolCards: [],
        meta: { intent: undefined },
      });

      const toolCards: ToolCallCardState[] = [];
      let content = "";
      let streamHadProgress = false;
      let messageMeta: ChatMessageMeta = {};

      try {
        const res = await fetch("/api/support/agent/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            sessionId: state.investigationSessionId ?? undefined,
            investigationId: state.activeInvestigationId ?? undefined,
            chatMode: state.chatMode,
            attachmentIds,
            conversationId: state.conversationId,
            canUseDeveloperMode,
          }),
          signal: opts?.signal,
        });

        if (!res.ok || !res.body) throw new Error("Stream unavailable — falling back");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data:")) continue;
            const event = JSON.parse(line.slice(5).trim()) as ChatStreamEvent;
            if (event.type === "intent_classified") {
              streamHadProgress = true;
              messageMeta = { ...messageMeta, intent: event.summary };
              updateChatMessage(assistantId, { content, meta: messageMeta });
            }
            if (event.type === "token") {
              streamHadProgress = true;
              content = applyChatContentEvent(content, event);
              updateChatMessage(assistantId, { content, meta: messageMeta });
            }
            if (event.type === "session_created") {
              streamHadProgress = true;
              setInvestigationSession(event.sessionId);
              if (event.investigationId) {
                setActiveInvestigation(event.investigationId);
                openTab({
                  id: `investigation-${event.investigationId}`,
                  kind: "investigation",
                  title: event.title,
                  payload: { investigationId: event.investigationId },
                });
              }
            }
            if (event.type === "approval_required") {
              messageMeta = {
                ...messageMeta,
                approvalId: event.approvalId,
              };
              updateChatMessage(assistantId, { content, meta: messageMeta });
            }
            if (event.type === "tool_call_start") {
              toolCards.push({
                id: event.toolCallId,
                agent: event.agent,
                action: event.name,
                status: "running",
                summary: event.summary ?? event.name,
              });
              updateChatMessage(assistantId, { toolCards: [...toolCards], content, meta: messageMeta });
            }
            if (event.type === "tool_call_result") {
              const card = toolCards.find((c) => c.id === event.toolCallId);
              if (card) {
                card.status = event.status;
                card.summary = event.summary;
              }
              updateChatMessage(assistantId, { toolCards: [...toolCards], content, meta: messageMeta });
            }
            if (event.type === "error") {
              updateChatMessage(assistantId, {
                content,
                meta: { ...messageMeta, error: event.error },
              });
            }
          }
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          updateChatMessage(assistantId, { content: `${content}\n[Stopped]` });
          return assistantId;
        }
        if (!shouldFallbackToInvestigate(streamHadProgress, content)) {
          updateChatMessage(assistantId, {
            content: content.trim()
              ? `${content}\n\n_(Stream interrupted — showing partial response.)_`
              : e instanceof Error
                ? e.message
                : "Request failed",
            meta: { error: e instanceof Error ? e.message : "Request failed" },
          });
          return assistantId;
        }
        try {
          const res = await fetch("/api/support/investigate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              state.investigationSessionId
                ? { sessionId: state.investigationSessionId, message: text }
                : { query: { text } }
            ),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Investigation failed");
          if (data.sessionId) setInvestigationSession(data.sessionId);
          updateChatMessage(assistantId, {
            content:
              data.chatReply ??
              data.markdownReport ??
              data.report?.plainEnglishSummary ??
              "Investigation complete.",
          });
        } catch {
          updateChatMessage(assistantId, {
            content: e instanceof Error ? e.message : "Request failed",
            meta: { error: e instanceof Error ? e.message : "Request failed" },
          });
        }
      } finally {
        sendingRef.current = false;
        opts?.onStreamingChange?.(false);
        void userId;
      }
      return assistantId;
    },
    [
      addChatMessage,
      updateChatMessage,
      state.investigationSessionId,
      state.activeInvestigationId,
      state.chatMode,
      state.conversationId,
      state.conversationAttachments,
      canUseDeveloperMode,
      setInvestigationSession,
      setActiveInvestigation,
      openTab,
    ]
  );

  return { sendStream, sendingRef };
}
