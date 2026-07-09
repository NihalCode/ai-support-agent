"use client";

import { X } from "lucide-react";
import { BottomPanel } from "./BottomPanel";
import { TerminalPanel } from "./TerminalPanel";
import { useWorkspace } from "./WorkspaceProvider";

const TABS = [
  { id: "terminal", label: "Terminal" },
  { id: "output", label: "Output" },
  { id: "problems", label: "Problems" },
  { id: "logs", label: "Logs" },
  { id: "tests", label: "Tests" },
  { id: "mcp", label: "MCP" },
  { id: "imports", label: "Import Jobs" },
  { id: "trace", label: "Agent Trace" },
] as const;

export function BottomPanelContainer() {
  const { state, setBottomTab, setLayoutSize } = useWorkspace();

  return (
    <>
      <div className="ide-bottom-tabs" role="tablist">
        <div className="ide-bottom-tabs-scroll">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              className={`ide-bottom-tab ${state.bottomTab === t.id ? "active" : ""}`}
              onClick={() => setBottomTab(t.id)}
              data-testid={`bottom-tab-${t.id}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ide-bottom-close"
          onClick={() => setLayoutSize({ bottomVisible: false })}
          aria-label="Close bottom panel"
          title="Close panel"
          data-testid="bottom-panel-close"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <div className="ide-bottom-content">
        {state.bottomTab === "terminal" && <TerminalPanel />}
        {state.bottomTab !== "terminal" && <BottomPanel hideTabs />}
      </div>
    </>
  );
}
