"use client";

import { AuthProvider } from "./auth/AuthProvider";
import { WorkspaceProvider } from "./ide/WorkspaceProvider";
import { AppShell } from "./ide/AppShell";

/** Root UI — AI Support Studio workspace shell. */
export function SupportAgent() {
  return (
    <AuthProvider>
      <WorkspaceProvider>
        <AppShell />
      </WorkspaceProvider>
    </AuthProvider>
  );
}
