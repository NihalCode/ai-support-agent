"use client";

import { WorkspaceProvider } from "./ide/WorkspaceProvider";
import { AppShell } from "./ide/AppShell";

/** Root UI — AI Support Studio workspace shell. */
export function SupportAgent() {
  return (
    <WorkspaceProvider>
      <AppShell />
    </WorkspaceProvider>
  );
}
