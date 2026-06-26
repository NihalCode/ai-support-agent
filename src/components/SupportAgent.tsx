"use client";

import { WorkspaceProvider } from "./ide/WorkspaceProvider";
import { AppShell } from "./ide/AppShell";

/** Root UI — Cursor-style AI investigation IDE shell. */
export function SupportAgent() {
  return (
    <WorkspaceProvider>
      <AppShell />
    </WorkspaceProvider>
  );
}
