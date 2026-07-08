"use client";

import { useCallback, useRef } from "react";
import { Command, Paperclip, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { IntegrationChipStatus } from "./IntegrationStatusChip";
import type { ChatMode } from "@/components/ide/types";
import type { PendingAttachment } from "@/hooks/useChatPanel";
import { CHAT_MODE_LABELS, CHAT_MODE_DESCRIPTIONS } from "@/agent/ModeSelector";
import { AppSelect } from "@/components/ui/AppSelect";

function ContextChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-0.5 text-[11px] text-slate-300">
      {children}
    </span>
  );
}

export function ChatComposer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  modeLabel,
  contextLabel,
  zendeskStatus,
  onAttach,
  onCommands,
  setCommandPalette,
  isClientMode,
  chatMode,
  onChatModeChange,
  canUseDeveloperMode,
  modeError,
  pendingAttachments,
  onFilesSelected,
  removePendingAttachment,
  fileInputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop?: () => void;
  streaming: boolean;
  modeLabel: string;
  contextLabel?: string;
  zendeskStatus?: IntegrationChipStatus;
  onAttach?: () => void;
  onCommands?: () => void;
  setCommandPalette?: (open: boolean) => void;
  isClientMode: boolean;
  chatMode?: ChatMode;
  onChatModeChange?: (mode: ChatMode) => void;
  canUseDeveloperMode?: boolean;
  modeError?: string | null;
  pendingAttachments?: PendingAttachment[];
  onFilesSelected?: (files: FileList | File[]) => void;
  removePendingAttachment?: (id: string) => void;
  fileInputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const dropRef = useRef<HTMLDivElement>(null);
  const attachments = pendingAttachments ?? [];

  const zendeskLabel =
    zendeskStatus === "connected"
      ? "Zendesk: connected"
      : zendeskStatus === "syncing"
        ? "Zendesk: syncing"
        : "Zendesk: not connected";

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.files.length && onFilesSelected) {
        onFilesSelected(e.dataTransfer.files);
      }
    },
    [onFilesSelected]
  );

  const canSend =
    (value.trim().length > 0 ||
      attachments.some((a) => !a.uploading && !a.error && a.status !== "failed")) &&
    !attachments.some((a) => a.uploading);

  return (
    <div className="border-t border-white/10 bg-slate-950/50 backdrop-blur-xl px-6 py-4">
      <div className="mx-auto max-w-[920px]">
        <div
          ref={dropRef}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="rounded-2xl border border-white/12 bg-slate-950/80 shadow-[0_18px_60px_rgba(0,0,0,0.42)] transition-all duration-200 focus-within:border-violet-400/40 focus-within:shadow-[0_0_40px_rgba(139,92,246,0.16)]"
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-white/8 px-4 py-2">
            {chatMode && onChatModeChange ? (
              <AppSelect
                testId="chat-mode-select"
                value={chatMode}
                onChange={(v) => onChatModeChange(v as ChatMode)}
                title={CHAT_MODE_DESCRIPTIONS[chatMode]}
                aria-label="Chat mode"
                triggerClassName="!rounded-full !border-violet-400/25 !bg-violet-500/10 !text-violet-100 !text-[11px] !py-0.5 !px-2.5"
                options={(Object.keys(CHAT_MODE_LABELS) as ChatMode[])
                  .filter((m) => m !== "developer" || canUseDeveloperMode)
                  .map((m) => ({
                    value: m,
                    label: CHAT_MODE_LABELS[m],
                    disabled: m === "developer" && !canUseDeveloperMode,
                  }))}
              />
            ) : (
              <ContextChip>{modeLabel}</ContextChip>
            )}
            {contextLabel && <ContextChip>{contextLabel}</ContextChip>}
            <ContextChip>{zendeskLabel}</ContextChip>
          </div>

          {modeError && (
            <p className="px-4 pt-2 text-xs text-amber-300" data-testid="chat-mode-error">
              {modeError}
            </p>
          )}

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 border-b border-white/8 px-4 py-2" data-testid="chat-attachment-chips">
              {attachments.map((a) => (
                <span
                  key={a.id}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px]",
                    a.error ? "border-red-400/30 text-red-200" : "border-white/10 text-slate-300"
                  )}
                  data-testid={`chat-attachment-chip-${a.id}`}
                >
                  {a.uploading ? "Uploading…" : a.filename}
                  {!a.uploading && removePendingAttachment && (
                    <button
                      type="button"
                      onClick={() => removePendingAttachment(a.id)}
                      className="text-slate-400 hover:text-white"
                      aria-label={`Remove ${a.filename}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}

          <textarea
            rows={2}
            data-testid="ai-chat-input"
            placeholder="Ask the agent to investigate, explore APIs, write CQL, or draft a response..."
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!streaming && canSend) void onSend();
              }
            }}
            disabled={streaming}
            className="max-h-40 min-h-[72px] w-full resize-none bg-transparent px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500"
          />
          <div className="flex items-center justify-between px-3 pb-3">
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                data-testid="chat-file-input"
                onChange={(e) => {
                  if (e.target.files?.length && onFilesSelected) {
                    onFilesSelected(e.target.files);
                    e.target.value = "";
                  }
                }}
              />
              <button
                type="button"
                onClick={onAttach}
                data-testid="chat-attach-button"
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-400 transition-all hover:bg-white/5 hover:text-slate-200"
              >
                <Paperclip className="h-3.5 w-3.5" />
                Attach
              </button>
              <button
                type="button"
                onClick={() => {
                  onCommands?.();
                  if (!isClientMode) setCommandPalette?.(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-400 transition-all hover:bg-white/5 hover:text-slate-200"
                data-testid={!isClientMode ? "open-command-palette-composer" : undefined}
              >
                <Command className="h-3.5 w-3.5" />
                Commands
              </button>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-slate-500 sm:inline">
                Enter to send · Shift Enter for newline
              </span>
              {streaming ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="rounded-xl border border-red-400/30 bg-red-500/15 px-4 py-2 text-sm font-medium text-red-200 transition-all hover:bg-red-500/25"
                >
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void onSend()}
                  disabled={!canSend || streaming}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 px-4 py-2 text-sm font-medium text-white shadow-[0_0_28px_rgba(139,92,246,0.28)] transition-all disabled:opacity-50"
                  )}
                  data-testid="chat-send-button"
                >
                  Send
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
