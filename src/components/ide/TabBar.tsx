"use client";

import type { EditorTab } from "./types";
import { useWorkspace } from "./WorkspaceProvider";

export function TabBar({
  groupId,
  tabs,
  activeTabId,
}: {
  groupId: string;
  tabs: EditorTab[];
  activeTabId: string | null;
}) {
  const { setActiveTab, closeTab, moveTabToOtherGroup, state } = useWorkspace();
  const canMove = state.editorLayout.groups.length > 1;

  return (
    <div className="ide-tab-bar" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTabId === tab.id}
          className={`ide-tab ${activeTabId === tab.id ? "active" : ""}`}
          onClick={() => setActiveTab(tab.id, groupId)}
          onContextMenu={(e) => {
            e.preventDefault();
            if (canMove) moveTabToOtherGroup(tab.id, groupId);
          }}
          title={canMove ? "Right-click to move to other group" : undefined}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{tab.title}</span>
          {tab.id !== "welcome" && (
            <span
              className="ide-tab-close"
              role="button"
              tabIndex={0}
              aria-label="Close tab"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id, groupId);
              }}
            >
              ×
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
