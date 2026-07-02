"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseSlashCommand } from "@/components/ide/workspace-state";
import { useWorkspace } from "@/components/ide/WorkspaceProvider";
import { useChatStream } from "@/hooks/useChatStream";
import { chipStatusForIntegration, type SupportStatusPayload } from "@/lib/chat/integration-status";

export function useChatPanel() {
  const { state, handleSlashInput, isClientMode, setCommandPalette } = useWorkspace();
  const { sendStream, sendingRef } = useChatStream();
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<SupportStatusPayload | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/support/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.chatMessages.length, streaming]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming || sendingRef.current) return;

    const parsed = parseSlashCommand(text);
    if (parsed?.rest) {
      setInput("");
      await sendStream(`${parsed.command} ${parsed.rest}`, { onStreamingChange: setStreaming });
      return;
    }
    if (parsed && handleSlashInput(text)) {
      setInput("");
      return;
    }

    setInput("");
    const controller = new AbortController();
    abortRef.current = controller;
    await sendStream(text, { onStreamingChange: setStreaming, signal: controller.signal });
    abortRef.current = null;
  }, [input, streaming, sendStream, handleSlashInput, sendingRef]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const contextLabel = state.activeInvestigationId
    ? "Context: Current investigation"
    : state.activeBuildProjectId
      ? "Context: Build session"
      : undefined;

  const zendeskStatus = chipStatusForIntegration("Zendesk", status, !isClientMode);

  return {
    state,
    isClientMode,
    setCommandPalette,
    input,
    setInput,
    streaming,
    send,
    stop,
    contextLabel,
    zendeskStatus,
    messagesEndRef,
  };
}

export type ChatPanelState = ReturnType<typeof useChatPanel>;
