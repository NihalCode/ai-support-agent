"use client";

import { AuthProvider } from "./auth/AuthProvider";
import { WorkspaceProvider } from "./ide/WorkspaceProvider";
import { PreferencesProvider } from "@/preferences/PreferencesProvider";
import { AppShell } from "./ide/AppShell";

/** Root UI — AI Support Studio workspace shell. */
export function SupportAgent() {
  return (
    <AuthProvider>
      <PreferencesProvider>
        <WorkspaceProvider>
          <AppShell />
        </WorkspaceProvider>
      </PreferencesProvider>
    </AuthProvider>
  );
}
