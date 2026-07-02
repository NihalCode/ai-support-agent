"use client";

import { ChatPanelContent } from "./ChatPanelContent";
import type { ChatPanelState } from "@/hooks/useChatPanel";

export function ChatCanvas({ panel }: { panel: ChatPanelState }) {
  return (
    <main className="min-w-0 min-h-0 flex flex-col bg-transparent">
      <ChatPanelContent panel={panel} />
    </main>
  );
}
