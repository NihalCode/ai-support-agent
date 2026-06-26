"use client";

import { useCallback, useRef, useState } from "react";
import type { ChatStreamEvent } from "@/lib/support/chat/stream-events";
import { useWorkspace } from "./WorkspaceProvider";
import { SLASH_COMMANDS } from "./types";
import { parseSlashCommand } from "./workspace-state";
import { IdeToolCallCard } from "./IdeToolCallCard";
import type { ToolCallCardState } from "./types";

export function AIChatPanel() {
  const {
    state,
    addChatMessage,
    updateChatMessage,
    handleSlashInput,
    setInvestigationSession,
    setActiveInvestigation,
    setActiveBuildProject,
    openTab,
    setActivity,
  } = useWorkspace();
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const sendStream = useCallback(
    async (text: string) => {
      const userId = addChatMessage({ role: "user", content: text });
      const assistantId = addChatMessage({ role: "assistant", content: "", toolCards: [] });
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;
      const toolCards: ToolCallCardState[] = [];
      let content = "";

      try {
        const res = await fetch("/api/support/agent/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            sessionId: state.investigationSessionId ?? undefined,
            investigationId: state.activeInvestigationId ?? undefined,
            buildProjectId: state.activeBuildProjectId ?? undefined,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error("Stream unavailable — falling back");
        }

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
            if (event.type === "token") {
              content += event.text;
              updateChatMessage(assistantId, { content });
            }
            if (event.type === "session_created") {
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
            if (event.type === "build_app_created") {
              setActiveBuildProject(event.projectId);
              setActivity("build-app");
              openTab({
                id: `build-app-${event.projectId}`,
                kind: "build-app",
                title: event.title,
                payload: { projectId: event.projectId },
              });
            }
            if (event.type === "build_app_updated" && event.projectId) {
              setActiveBuildProject(event.projectId);
            }
            if (event.type === "approval_required") {
              content += `\n\n_Pending approval \`${event.approvalId.slice(0, 8)}…\` — review in Build App workspace or Approvals panel._`;
              updateChatMessage(assistantId, { content });
            }
            if (event.type === "tool_call_start") {
              toolCards.push({
                id: event.toolCallId,
                agent: event.agent,
                action: event.name,
                status: "running",
                summary: event.summary ?? event.name,
              });
              updateChatMessage(assistantId, { toolCards: [...toolCards] });
            }
            if (event.type === "tool_call_result") {
              const card = toolCards.find((c) => c.id === event.toolCallId);
              if (card) {
                card.status = event.status;
                card.summary = event.summary;
              }
              updateChatMessage(assistantId, { toolCards: [...toolCards] });
            }
            if (event.type === "error") {
              updateChatMessage(assistantId, { content: event.error });
            }
          }
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          updateChatMessage(assistantId, { content: `${content}\n[Stopped]` });
          return;
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
          });
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
        void userId;
      }
    },
    [
      addChatMessage,
      updateChatMessage,
      state.investigationSessionId,
      state.activeInvestigationId,
      state.activeBuildProjectId,
      setInvestigationSession,
      setActiveInvestigation,
      setActiveBuildProject,
      openTab,
      setActivity,
    ]
  );

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;

    const parsed = parseSlashCommand(text);
    if (parsed) {
      const match = SLASH_COMMANDS.find((c) => c.cmd === parsed.command);
      if (match && (match.action === "build-app" || match.action === "deployments") && parsed.rest) {
        setInput("");
        await sendStream(parsed.rest);
        return;
      }
    }

    if (handleSlashInput(text)) {
      setInput("");
      return;
    }
    setInput("");
    await sendStream(text);
  }

  function stop() {
    abortRef.current?.abort();
  }

  return (
    <>
      <div className="ide-chat-header">AI Support Agent</div>
      <div className="ide-chat-messages">
        {state.chatMessages.length === 0 && (
          <div className="ide-empty" style={{ padding: 16 }}>
            <p>
              Describe a support issue or ask to build a Cyware API app — the agent routes automatically to
              investigation or Build App.
            </p>
            <p style={{ fontSize: 11, color: "var(--muted)" }}>
              Support: &quot;Our block malicious IP workflow stops after 30 seconds.&quot;
              <br />
              Build: &quot;Build me a CTIX indicator search dashboard and prepare it for Vercel.&quot;
            </p>
            <p style={{ fontSize: 11 }}>{SLASH_COMMANDS.slice(0, 6).map((c) => c.cmd).join(" · ")}</p>
          </div>
        )}
        {state.chatMessages.map((m) => (
          <div key={m.id} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", marginBottom: 4 }}>
              {m.role}
            </div>
            <div
              style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, fontSize: 13 }}
              data-testid={m.role === "assistant" ? "chat-assistant-message" : undefined}
            >
              {m.content}
            </div>
            {m.toolCards?.map((c) => (
              <IdeToolCallCard key={c.id} card={c} />
            ))}
          </div>
        ))}
      </div>
      <div className="ide-chat-input-row">
        <input
          className="ide-chat-input"
          data-testid="ai-chat-input"
          placeholder="Support issue or build an app…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          disabled={streaming}
        />
        {streaming ? (
          <button type="button" onClick={stop} style={btnStyle("#f85149")}>
            Stop
          </button>
        ) : (
          <button type="button" onClick={() => void send()} style={btnStyle("var(--accent)")}>
            Send
          </button>
        )}
      </div>
    </>
  );
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    background: bg,
    border: "none",
    borderRadius: 6,
    color: "#fff",
    padding: "0 12px",
    cursor: "pointer",
    fontSize: 12,
  };
}
