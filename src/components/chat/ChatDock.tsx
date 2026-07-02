"use client";

import { MessageSquare, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ChatPanelState } from "@/hooks/useChatPanel";
import { ChatPanelContent } from "./ChatPanelContent";

export function ChatDock({
  panel,
  open,
  onClose,
  onExpand,
}: {
  panel: ChatPanelState;
  open: boolean;
  onClose: () => void;
  onExpand?: () => void;
}) {
  if (!open) {
    return (
      <button
        type="button"
        onClick={onExpand}
        className="chat-dock-fab fixed bottom-6 right-[380px] z-30 flex items-center gap-2 rounded-full border border-violet-400/30 bg-slate-950/90 px-4 py-2.5 text-sm text-violet-100 shadow-[0_0_30px_rgba(139,92,246,0.2)] backdrop-blur-xl hover:bg-slate-900"
        data-testid="chat-dock-fab"
      >
        <MessageSquare className="h-4 w-4" />
        AI Chat
        {panel.state.chatMessages.length > 0 && (
          <span className="rounded-full bg-violet-500/30 px-2 py-0.5 text-xs">
            {panel.state.chatMessages.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "chat-dock fixed bottom-0 left-[260px] right-[360px] z-30 flex max-h-[min(520px,55vh)] min-h-[280px] flex-col",
        "border-t border-violet-400/25 bg-slate-950/95 shadow-[0_-12px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl"
      )}
      data-testid="chat-dock"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <div className="flex items-center gap-2 text-sm font-medium text-white">
          <MessageSquare className="h-4 w-4 text-violet-300" />
          AI Chat
        </div>
        <div className="flex items-center gap-2">
          {onExpand && (
            <button
              type="button"
              onClick={onExpand}
              className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-white/5 hover:text-white"
              data-testid="chat-dock-expand"
            >
              Open full chat
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-white/5 hover:text-white"
            aria-label="Close chat dock"
            data-testid="chat-dock-close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <ChatPanelContent panel={panel} compact />
      </div>
    </div>
  );
}
