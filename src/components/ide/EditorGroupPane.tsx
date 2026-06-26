"use client";

import { EditorArea } from "./EditorArea";
import { TabBar } from "./TabBar";
import type { EditorGroup } from "./types";
import { useWorkspace } from "./WorkspaceProvider";

export function EditorGroupPane({ group }: { group: EditorGroup }) {
  const { setActiveGroup } = useWorkspace();

  return (
    <div
      className="ide-editor-group"
      onFocus={() => setActiveGroup(group.id)}
      onMouseDown={() => setActiveGroup(group.id)}
    >
      <TabBar groupId={group.id} tabs={group.tabs} activeTabId={group.activeTabId} />
      <EditorArea groupId={group.id} tabs={group.tabs} activeTabId={group.activeTabId} />
    </div>
  );
}
