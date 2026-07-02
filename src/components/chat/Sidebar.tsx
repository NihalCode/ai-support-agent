"use client";

import { useState } from "react";
import {
  Activity,
  BookOpen,
  Bot,
  ChevronDown,
  MessageSquare,
  Plug,
  ScrollText,
  SearchCheck,
  Settings,
  ShieldCheck,
  Terminal,
  AlertTriangle,
} from "lucide-react";
import type { ActivityId, BottomPanelTab } from "@/components/ide/types";
import { cn } from "@/lib/cn";
import { useWorkspace } from "@/components/ide/WorkspaceProvider";

type NavItem = {
  label: string;
  icon: typeof MessageSquare;
  activity: ActivityId;
  testId: string;
  settingsSection?: "integrations" | "health" | "credentials";
  integrationsTab?: "approvals";
};

const NAV_ITEMS: NavItem[] = [
  { label: "AI Chat", icon: MessageSquare, activity: "home", testId: "activity-home" },
  { label: "Investigations", icon: SearchCheck, activity: "investigations", testId: "activity-investigations" },
  { label: "Integrations", icon: Plug, activity: "settings", testId: "activity-integrations", settingsSection: "integrations" },
  { label: "Knowledge", icon: BookOpen, activity: "search", testId: "activity-search" },
  { label: "Approvals", icon: ShieldCheck, activity: "settings", testId: "activity-approvals", integrationsTab: "approvals" },
  { label: "Audit Logs", icon: ScrollText, activity: "logs", testId: "activity-logs" },
  { label: "System Health", icon: Activity, activity: "settings", testId: "activity-health", settingsSection: "health" },
  { label: "Settings", icon: Settings, activity: "settings", testId: "activity-settings", settingsSection: "credentials" },
];

const DEV_EXTRA_ITEMS: NavItem[] = [
  { label: "Explorer", icon: Bot, activity: "explorer", testId: "activity-explorer" },
  { label: "API Registry", icon: Plug, activity: "api-registry", testId: "activity-api-registry" },
  { label: "CQL", icon: Activity, activity: "cql", testId: "activity-cql" },
  { label: "Jira", icon: ScrollText, activity: "jira", testId: "activity-jira" },
  { label: "MCP", icon: Plug, activity: "mcp", testId: "activity-mcp" },
];

const ADVANCED_ITEMS: { label: string; tab: BottomPanelTab; testId: string }[] = [
  { label: "Terminal", tab: "terminal", testId: "sidebar-advanced-terminal" },
  { label: "Problems", tab: "problems", testId: "sidebar-advanced-problems" },
  { label: "MCP", tab: "mcp", testId: "sidebar-advanced-mcp" },
  { label: "Agent Trace", tab: "trace", testId: "sidebar-advanced-trace" },
];

export function Sidebar({
  connectedCount,
  pendingApprovals,
  open,
  onClose,
}: {
  connectedCount: number;
  pendingApprovals: number;
  open?: boolean;
  onClose?: () => void;
}) {
  const { state, setActivity, openTab, setBottomTab, toggleBottom, isClientMode } = useWorkspace();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  function navigate(item: NavItem) {
    if (item.integrationsTab) {
      setActivity(item.activity, { sidebarNavId: item.testId, skipDefaultTab: true });
      openTab({
        id: "integrations",
        kind: "integrations",
        title: "Integrations",
        payload: { tab: item.integrationsTab },
      });
      onClose?.();
      return;
    }

    if (item.settingsSection) {
      setActivity(item.activity, { sidebarNavId: item.testId, skipDefaultTab: true });
      openTab({
        id: "settings",
        kind: "settings",
        title: "Settings",
        payload: { section: item.settingsSection },
      });
      onClose?.();
      return;
    }

    setActivity(item.activity, { sidebarNavId: item.testId });
    onClose?.();
  }

  function openAdvanced(tab: BottomPanelTab) {
    setBottomTab(tab);
    toggleBottom();
    onClose?.();
  }

  return (
    <aside
      className={cn(
        "chat-sidebar border-r border-white/10 bg-slate-950/45 backdrop-blur-xl p-3 flex flex-col gap-3 min-h-0",
        open && "chat-sidebar--open"
      )}
      data-testid="activity-bar"
    >
      <nav className="flex flex-col gap-1 overflow-y-auto min-h-0 flex-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = state.sidebarNavId === item.testId;
          return (
            <button
              key={item.testId}
              type="button"
              data-testid={item.testId}
              onClick={() => navigate(item)}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200",
                active
                  ? "bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                  : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-100"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}

        {!isClientMode && (
          <>
            {DEV_EXTRA_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = state.sidebarNavId === item.testId;
              return (
                <button
                  key={item.testId}
                  type="button"
                  data-testid={item.testId}
                  onClick={() => navigate(item)}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200",
                    active
                      ? "bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                      : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-100"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          <div className="mt-2 border-t border-white/8 pt-2">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500 hover:text-slate-300"
              data-testid="sidebar-advanced-toggle"
            >
              <span className="flex items-center gap-2">
                <Bot className="h-3.5 w-3.5" />
                Advanced
              </span>
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", advancedOpen && "rotate-180")} />
            </button>
            {advancedOpen && (
              <div className="mt-1 space-y-0.5" data-testid="sidebar-advanced-section">
                {ADVANCED_ITEMS.map((item) => (
                  <button
                    key={item.tab}
                    type="button"
                    data-testid={item.testId}
                    onClick={() => openAdvanced(item.tab)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
                  >
                    {item.tab === "terminal" && <Terminal className="h-3.5 w-3.5" />}
                    {item.tab === "problems" && <AlertTriangle className="h-3.5 w-3.5" />}
                    {item.tab === "mcp" && <Plug className="h-3.5 w-3.5" />}
                    {item.tab === "trace" && <Bot className="h-3.5 w-3.5" />}
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          </>
        )}
      </nav>

      <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3 text-xs text-slate-400">
        <div className="font-medium text-white">Workspace status</div>
        <p className="mt-2 leading-5">{connectedCount} integrations connected</p>
        <p className="leading-5">{pendingApprovals} approvals pending</p>
      </div>
    </aside>
  );
}
