"use client";

import { useEffect } from "react";
import { useWorkspace } from "./WorkspaceProvider";

export function useKeyboardShortcuts() {
  const {
    setCommandPalette,
    toggleSidebar,
    toggleBottom,
    runCommand,
    splitEditorRight,
    splitEditorDown,
  } = useWorkspace();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      if (e.key === "\\" && !e.altKey) {
        e.preventDefault();
        splitEditorRight();
        return;
      }
      if (e.key === "\\" && e.altKey) {
        e.preventDefault();
        splitEditorDown();
        return;
      }
      if (e.key === "k" && !e.shiftKey) {
        e.preventDefault();
        setCommandPalette(true);
        return;
      }
      if (e.key === "P" && e.shiftKey) {
        e.preventDefault();
        setCommandPalette(true);
        return;
      }
      if (e.key === "b") {
        e.preventDefault();
        toggleSidebar();
        return;
      }
      if (e.key === "j") {
        e.preventDefault();
        toggleBottom();
        return;
      }
      if (e.key === "`") {
        e.preventDefault();
        toggleBottom();
        return;
      }
      if (e.key === "p" && !e.shiftKey) {
        e.preventDefault();
        setCommandPalette(true);
        return;
      }
      if (e.key === "f" && e.shiftKey) {
        e.preventDefault();
        runCommand("search");
        return;
      }
      if (e.key === "I" && e.shiftKey) {
        e.preventDefault();
        runCommand("investigate");
        return;
      }
      if (e.key === "C" && e.shiftKey) {
        e.preventDefault();
        runCommand("cql");
        return;
      }
      if (e.key === "M" && e.shiftKey) {
        e.preventDefault();
        runCommand("mcp");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    setCommandPalette,
    toggleSidebar,
    toggleBottom,
    runCommand,
    splitEditorRight,
    splitEditorDown,
  ]);
}
