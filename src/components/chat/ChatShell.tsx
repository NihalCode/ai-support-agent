"use client";

import { useEffect, useMemo, useState } from "react";
import "@/components/ide/ide.css";
import "./chat.css";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { ChatCanvas } from "./ChatCanvas";
import { ChatDock } from "./ChatDock";
import { ContextPanel } from "./ContextPanel";
import {
  chipStatusForIntegration,
  countConnected,
  type SupportStatusPayload,
} from "@/lib/chat/integration-status";
import type { IntegrationChipStatus } from "./IntegrationStatusChip";
import { SplitEditorLayout } from "@/components/ide/SplitEditorLayout";
import { PrimarySidebar } from "@/components/ide/PrimarySidebar";
import { BottomPanelContainer } from "@/components/ide/BottomPanelContainer";
import { CommandPalette } from "@/components/ide/CommandPalette";
import { StatusBar } from "@/components/ide/StatusBar";
import { useWorkspace } from "@/components/ide/WorkspaceProvider";
import { useChatPanel } from "@/hooks/useChatPanel";

const INTEGRATION_NAMES = ["Slack", "Zendesk", "Confluence", "Jira"] as const;

export function ChatShell() {
  const { state, isClientMode, setActivity, setLayoutSize } = useWorkspace();
  const chatPanel = useChatPanel();
  const [status, setStatus] = useState<SupportStatusPayload | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);

  useEffect(() => {
    fetch("/api/support/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => undefined);
    fetch("/api/support/approvals?status=pending")
      .then((r) => r.json())
      .then((d) => setPendingApprovals(Array.isArray(d.approvals) ? d.approvals.length : 0))
      .catch(() => undefined);
  }, []);

  const showChatCanvas = state.activity === "home" || state.activity === "chat";
  const chatDockOpen = !showChatCanvas && state.layout.chatVisible;

  useEffect(() => {
    if (!showChatCanvas && state.chatMessages.length > 0 && !state.layout.chatVisible) {
      queueMicrotask(() => setLayoutSize({ chatVisible: true }));
    }
  }, [showChatCanvas, state.chatMessages.length, state.layout.chatVisible, setLayoutSize]);

  const integrations = useMemo(
    () =>
      INTEGRATION_NAMES.map((name) => ({
        name,
        status: chipStatusForIntegration(name, status, !isClientMode) as IntegrationChipStatus,
      })),
    [status, isClientMode]
  );

  return (
    <div
      className="chat-shell min-h-screen bg-[#07090d] text-slate-50 relative overflow-hidden"
      data-testid="ide-root"
      data-product-mode={isClientMode ? "client" : "developer"}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(139,92,246,0.18),transparent_32%),radial-gradient(circle_at_80%_0%,rgba(6,182,212,0.13),transparent_28%),linear-gradient(to_bottom,#07090d,#0b0f17_45%,#07090d)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:48px_48px] opacity-40" />

      <div className="relative z-10 h-screen grid grid-rows-[64px_1fr] min-h-0">
        <TopBar
          integrations={integrations}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          onToggleContext={() => setContextOpen((v) => !v)}
          showChatToggle={!showChatCanvas}
          chatOpen={chatDockOpen}
          onToggleChat={() => setLayoutSize({ chatVisible: !state.layout.chatVisible })}
        />
        <div className="chat-main-grid relative z-0 grid grid-cols-[260px_minmax(0,1fr)_360px] min-h-0">
          <Sidebar
            connectedCount={countConnected(status)}
            pendingApprovals={pendingApprovals}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
          {showChatCanvas ? (
            <ChatCanvas panel={chatPanel} />
          ) : (
            <div className="min-w-0 min-h-0 flex flex-col bg-transparent overflow-hidden ide-center-col relative">
              <div className="flex flex-1 min-h-0 overflow-hidden">
                {!isClientMode && (
                  <div className="hidden md:flex w-[240px] shrink-0 border-r border-white/10 overflow-y-auto bg-slate-950/30">
                    <PrimarySidebar />
                  </div>
                )}
                <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
                  <SplitEditorLayout />
                </div>
              </div>
              {!isClientMode && (
                <div
                  className="border-t border-white/10 bg-slate-950/60 max-h-[40vh] min-h-[120px] overflow-hidden flex flex-col"
                  data-testid="ide-bottom-panel"
                >
                  <BottomPanelContainer />
                </div>
              )}
              <ChatDock
                panel={chatPanel}
                open={chatDockOpen}
                onClose={() => setLayoutSize({ chatVisible: false })}
                onExpand={() => setActivity("home", { sidebarNavId: "activity-home" })}
              />
            </div>
          )}
          <ContextPanel
            integrations={integrations}
            pendingApprovals={pendingApprovals}
            open={contextOpen}
            onClose={() => setContextOpen(false)}
          />
        </div>
      </div>

      <StatusBar />
      {!isClientMode && <CommandPalette />}
    </div>
  );
}
