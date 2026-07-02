"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseSlashCommand } from "@/components/ide/workspace-state";
import { useWorkspace } from "@/components/ide/WorkspaceProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { useChatStream } from "@/hooks/useChatStream";
import { chipStatusForIntegration, type SupportStatusPayload } from "@/lib/chat/integration-status";
import type { ChatMode, ConversationAttachmentRef } from "@/components/ide/types";
import { CHAT_MODE_LABELS } from "@/agent/ModeSelector";

export interface PendingAttachment {
  id: string;
  filename: string;
  detectedType: string;
  summary?: string;
  sizeBytes: number;
  status: string;
  uploading?: boolean;
  error?: string;
}

export function useChatPanel() {
  const {
    state,
    handleSlashInput,
    isClientMode,
    setCommandPalette,
    chatMode,
    setChatMode,
    addConversationAttachment,
    removeConversationAttachment,
  } = useWorkspace();
  const { canUseDeveloperMode } = useAuth();
  const { sendStream, sendingRef } = useChatStream();
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<SupportStatusPayload | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [modeError, setModeError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/support/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.chatMessages.length, streaming]);

  const uploadFile = useCallback(
    async (file: File) => {
      const tempId = crypto.randomUUID();
      setPendingAttachments((prev) => [
        ...prev,
        {
          id: tempId,
          filename: file.name,
          detectedType: "unknown",
          sizeBytes: file.size,
          status: "uploading",
          uploading: true,
        },
      ]);

      const form = new FormData();
      form.append("file", file);
      form.append("conversationId", state.conversationId);

      try {
        const res = await fetch("/api/files/upload", { method: "POST", body: form });
        const data = (await res.json()) as {
          attachment?: ConversationAttachmentRef & { warnings?: string[] };
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Upload failed");

        const att = data.attachment!;
        if (att.status === "blocked") {
          throw new Error(att.summary ?? "File blocked");
        }

        const ref: ConversationAttachmentRef = {
          id: att.id,
          filename: att.filename,
          detectedType: att.detectedType,
          summary: att.summary,
          sizeBytes: att.sizeBytes,
          status: att.status,
        };
        addConversationAttachment(ref);
        setPendingAttachments((prev) =>
          prev.map((p) =>
            p.id === tempId
              ? {
                  id: ref.id,
                  filename: ref.filename,
                  detectedType: ref.detectedType,
                  summary: ref.summary,
                  sizeBytes: ref.sizeBytes,
                  status: ref.status,
                  uploading: false,
                }
              : p
          )
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Upload failed";
        setPendingAttachments((prev) =>
          prev.map((p) => (p.id === tempId ? { ...p, uploading: false, error: msg, status: "failed" } : p))
        );
      }
    },
    [state.conversationId, addConversationAttachment]
  );

  const onFilesSelected = useCallback(
    (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        void uploadFile(file);
      }
    },
    [uploadFile]
  );

  const removePendingAttachment = useCallback(
    (id: string) => {
      setPendingAttachments((prev) => prev.filter((p) => p.id !== id));
      removeConversationAttachment(id);
      void fetch(`/api/files/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
    },
    [removeConversationAttachment]
  );

  const handleChatModeChange = useCallback(
    (mode: ChatMode) => {
      if (mode === "developer" && !canUseDeveloperMode) {
        setModeError("Developer mode requires elevated permissions.");
        return;
      }
      setModeError(null);
      setChatMode(mode);
    },
    [canUseDeveloperMode, setChatMode]
  );

  const send = useCallback(async () => {
    const text = input.trim();
    const readyIds = pendingAttachments.filter((p) => !p.uploading && !p.error && p.status !== "failed").map((p) => p.id);
    if ((!text && readyIds.length === 0) || streaming || sendingRef.current) return;

    const parsed = parseSlashCommand(text);
    if (parsed?.rest) {
      setInput("");
      setPendingAttachments([]);
      await sendStream(`${parsed.command} ${parsed.rest}`, {
        onStreamingChange: setStreaming,
        attachmentIds: readyIds,
      });
      return;
    }
    if (parsed && handleSlashInput(text)) {
      setInput("");
      return;
    }

    setInput("");
    setPendingAttachments([]);
    const controller = new AbortController();
    abortRef.current = controller;
    await sendStream(text || "Analyze the uploaded file(s).", {
      onStreamingChange: setStreaming,
      signal: controller.signal,
      attachmentIds: readyIds,
    });
    abortRef.current = null;
  }, [input, pendingAttachments, streaming, sendStream, handleSlashInput, sendingRef]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const contextLabel = state.activeInvestigationId
    ? "Context: Current investigation"
    : state.activeBuildProjectId
      ? "Context: Generated app"
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
    chatMode,
    chatModeLabel: CHAT_MODE_LABELS[chatMode],
    onChatModeChange: handleChatModeChange,
    modeError,
    canUseDeveloperMode,
    pendingAttachments,
    onAttachClick: () => fileInputRef.current?.click(),
    onFilesSelected,
    removePendingAttachment,
    fileInputRef,
    conversationAttachments: state.conversationAttachments,
  };
}

export type ChatPanelState = ReturnType<typeof useChatPanel>;
