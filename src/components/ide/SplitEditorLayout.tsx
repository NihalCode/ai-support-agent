"use client";

import { EditorGroupPane } from "./EditorGroupPane";
import { useWorkspace } from "./WorkspaceProvider";

export function SplitEditorLayout() {
  const { state } = useWorkspace();
  const { editorLayout } = state;
  const orientationClass =
    editorLayout.orientation === "vertical"
      ? "vertical"
      : editorLayout.orientation === "horizontal"
        ? "horizontal"
        : "single";

  return (
    <div className={`ide-editor-grid ${orientationClass}`}>
      {editorLayout.groups.map((group) => (
        <EditorGroupPane key={group.id} group={group} />
      ))}
    </div>
  );
}
