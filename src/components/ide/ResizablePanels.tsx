"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { useWorkspace } from "./WorkspaceProvider";

export function ResizableSidebar({ children }: { children: ReactNode }) {
  const { state, setLayoutSize } = useWorkspace();
  const dragging = useRef(false);

  const onMouseDown = useCallback(() => {
    dragging.current = true;
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setLayoutSize({ sidebarWidth: Math.max(180, Math.min(480, e.clientX - 48)) });
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [setLayoutSize]);

  if (!state.layout.sidebarVisible) return null;

  return (
    <>
      <aside className="ide-sidebar" style={{ width: state.layout.sidebarWidth }}>
        {children}
      </aside>
      <div className="ide-resizer-v" role="separator" aria-orientation="vertical" onMouseDown={onMouseDown} />
    </>
  );
}

export function ResizableChat({ children }: { children: ReactNode }) {
  const { state, setLayoutSize } = useWorkspace();
  const dragging = useRef(false);

  const onMouseDown = useCallback(() => {
    dragging.current = true;
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setLayoutSize({ chatWidth: Math.max(280, Math.min(560, window.innerWidth - e.clientX)) });
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [setLayoutSize]);

  if (!state.layout.chatVisible) return null;

  return (
    <>
      <div className="ide-resizer-v" role="separator" aria-orientation="vertical" onMouseDown={onMouseDown} />
      <aside className="ide-chat-panel" style={{ width: state.layout.chatWidth }}>
        {children}
      </aside>
    </>
  );
}

export function ResizableBottom({ children }: { children: ReactNode }) {
  const { state, setLayoutSize } = useWorkspace();
  const dragging = useRef(false);

  const onMouseDown = useCallback(() => {
    dragging.current = true;
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setLayoutSize({ bottomHeight: Math.max(120, Math.min(400, window.innerHeight - e.clientY - 24)) });
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [setLayoutSize]);

  if (!state.layout.bottomVisible) return null;

  return (
    <>
      <div className="ide-resizer-h" role="separator" aria-orientation="horizontal" onMouseDown={onMouseDown} />
      <section className="ide-bottom-panel" style={{ height: state.layout.bottomHeight }}>
        {children}
      </section>
    </>
  );
}
