"use client";

import { MessageSquare, Sparkles } from "lucide-react";
import { productConfig } from "@/lib/product-config";
import { cn } from "@/lib/cn";
import { IntegrationStatusChip, type IntegrationChipStatus } from "./IntegrationStatusChip";
import { UserMenu } from "@/components/auth/UserMenu";
import { useAuth } from "@/components/auth/AuthProvider";
import { useWorkspace } from "@/components/ide/WorkspaceProvider";
import { ProductModeToggle } from "./ProductModeToggle";

export function TopBar({
  integrations,
  onToggleContext,
  onToggleSidebar,
  showChatToggle,
  chatOpen,
  onToggleChat,
}: {
  integrations: { name: string; status: IntegrationChipStatus }[];
  onToggleContext?: () => void;
  onToggleSidebar?: () => void;
  showChatToggle?: boolean;
  chatOpen?: boolean;
  onToggleChat?: () => void;
}) {
  const { isClientMode, setCommandPalette } = useWorkspace();
  const { canUseDeveloperMode } = useAuth();

  return (
    <header className="relative z-[60] shrink-0 overflow-visible h-16 border-b border-white/10 bg-slate-950/60 backdrop-blur-xl flex items-center justify-between px-5 gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          className="lg:hidden text-slate-400 hover:text-white"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
        >
          ☰
        </button>
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 shadow-[0_0_30px_rgba(139,92,246,0.35)] flex items-center justify-center shrink-0">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white truncate" data-testid="app-title">
            {productConfig.appName}
          </div>
          <div className="text-xs text-slate-400 truncate">Enterprise support workspace</div>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-2 flex-wrap justify-center">
        {integrations.map((i) => (
          <IntegrationStatusChip key={i.name} name={i.name} status={i.status} />
        ))}
      </div>

      <div className="flex items-center gap-2 shrink-0 min-h-9">
        {showChatToggle && (
          <button
            type="button"
            onClick={onToggleChat}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-all",
              chatOpen
                ? "border-violet-400/30 bg-violet-500/15 text-violet-100"
                : "border-white/10 text-slate-300 hover:bg-white/5"
            )}
            data-testid="topbar-toggle-chat"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Chat
          </button>
        )}

        <ProductModeToggle />

        {!isClientMode && canUseDeveloperMode && (
          <button
            type="button"
            onClick={() => setCommandPalette(true)}
            className="hidden sm:inline-flex rounded-lg border border-white/10 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/5"
            data-testid="open-command-palette"
          >
            Command
          </button>
        )}

        <UserMenu />

        <button
          type="button"
          className="xl:hidden rounded-lg border border-white/10 p-2 text-slate-400 hover:text-white"
          onClick={onToggleContext}
          aria-label="Toggle context panel"
          data-testid="toggle-context-panel"
        >
          ◫
        </button>
      </div>
    </header>
  );
}
