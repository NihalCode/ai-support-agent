"use client";

import "./ide.css";
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
  const { setCommandPalette, toggleChat } = useWorkspace();

  return (
    <div className="ide-root" data-testid="ide-root">
      <header className="ide-header">
        <span className="ide-header-title">AI Support Investigation IDE</span>
        <span className="ide-header-spacer" />
        <button
          type="button"
          className="ide-tree-item"
          style={{ width: "auto", padding: "4px 10px" }}
          onMouseDown={(e) => {
            e.preventDefault();
            setCommandPalette(true);
          }}
          title="Ctrl+K"
          data-testid="open-command-palette"
        >
          ⌘ Command
        </button>
        <button
          type="button"
          className="ide-tree-item"
          style={{ width: "auto", padding: "4px 10px" }}
          onClick={toggleChat}
          title="Toggle AI chat"
        >
          Chat
        </button>
      </header>

      <div className="ide-main">
        <ActivityBar />
        <ResizableSidebar>
          <PrimarySidebar />
        </ResizableSidebar>

        <div className="ide-center-col">
          <SplitEditorLayout />
          <ResizableBottom>
            <BottomPanelContainer />
          </ResizableBottom>
        </div>

        <ResizableChat>
          <AIChatPanel />
        </ResizableChat>
      </div>

      <StatusBar />
      <CommandPalette />
    </div>
  );
}
