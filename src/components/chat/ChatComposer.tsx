"use client";

import { Command, Paperclip } from "lucide-react";
import { cn } from "@/lib/cn";
import type { IntegrationChipStatus } from "./IntegrationStatusChip";

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
}) {
  const zendeskLabel =
    zendeskStatus === "connected"
      ? "Zendesk: connected"
      : zendeskStatus === "syncing"
        ? "Zendesk: syncing"
        : "Zendesk: not connected";

  return (
    <div className="border-t border-white/10 bg-slate-950/50 backdrop-blur-xl px-6 py-4">
      <div className="mx-auto max-w-[920px]">
        <div className="rounded-2xl border border-white/12 bg-slate-950/80 shadow-[0_18px_60px_rgba(0,0,0,0.42)] transition-all duration-200 focus-within:border-violet-400/40 focus-within:shadow-[0_0_40px_rgba(139,92,246,0.16)]">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/8 px-4 py-2">
            <ContextChip>{modeLabel}</ContextChip>
            {contextLabel && <ContextChip>{contextLabel}</ContextChip>}
            <ContextChip>{zendeskLabel}</ContextChip>
          </div>
          <textarea
            rows={2}
            data-testid="ai-chat-input"
            placeholder="Ask the agent to build, investigate, summarize, connect, or deploy..."
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!streaming) void onSend();
              }
            }}
            disabled={streaming}
            className="max-h-40 min-h-[72px] w-full resize-none bg-transparent px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500"
          />
          <div className="flex items-center justify-between px-3 pb-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onAttach}
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
                  disabled={!value.trim() || streaming}
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
