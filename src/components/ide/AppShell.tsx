"use client";

import "./ide.css";
import { productConfig } from "@/lib/product-config";
import { ActivityBar } from "./ActivityBar";
import { PrimarySidebar } from "./PrimarySidebar";
import { SplitEditorLayout } from "./SplitEditorLayout";
import { AIChatPanel } from "./AIChatPanel";
import { BottomPanelContainer } from "./BottomPanelContainer";
import { StatusBar } from "./StatusBar";
import { CommandPalette } from "./CommandPalette";
import { ResizableSidebar, ResizableChat, ResizableBottom } from "./ResizablePanels";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { useWorkspace } from "./WorkspaceProvider";

export function AppShell() {
  useKeyboardShortcuts();
  const { setCommandPalette, toggleChat, isClientMode, productMode, setProductMode } = useWorkspace();

  return (
    <div
      className={`ide-root ${isClientMode ? "ide-root--client" : "ide-root--developer"}`}
      data-testid="ide-root"
      data-product-mode={productMode}
    >
      <header className="ide-header">
        <span className="ide-header-title" data-testid="app-title">
          {productConfig.appName}
        </span>
        <span className="ide-header-spacer" />
        <label className="ide-mode-toggle" data-testid="product-mode-toggle">
          <span className="ide-mode-toggle-label">Mode</span>
          <select
            value={productMode}
            onChange={(e) => setProductMode(e.target.value as "client" | "developer")}
            aria-label="Client or Developer mode"
          >
            <option value="client">Client</option>
            <option value="developer">Developer</option>
          </select>
        </label>
        {!isClientMode && (
          <button
            type="button"
            className="ide-tree-item"
            style={{ width: "auto", padding: "4px 10px" }}
            onMouseDown={(e) => {
              e.preventDefault();
              setCommandPalette(true);
            }}
            title="Command palette"
            data-testid="open-command-palette"
          >
            Command
          </button>
        )}
        <button
          type="button"
          className="ide-tree-item"
          style={{ width: "auto", padding: "4px 10px" }}
          onClick={toggleChat}
          title="Toggle assistant"
        >
          Assistant
        </button>
      </header>

      <div className="ide-main">
        <ActivityBar />
        {!isClientMode && (
          <ResizableSidebar>
            <PrimarySidebar />
          </ResizableSidebar>
        )}

        <div className="ide-center-col">
          <SplitEditorLayout />
          {!isClientMode && (
            <ResizableBottom>
              <BottomPanelContainer />
            </ResizableBottom>
          )}
        </div>

        <ResizableChat>
          <AIChatPanel />
        </ResizableChat>
      </div>

      <StatusBar />
      {!isClientMode && <CommandPalette />}
    </div>
  );
}
