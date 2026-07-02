"use client";

import { ChatShell } from "@/components/chat/ChatShell";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

export function AppShell() {
  useKeyboardShortcuts();
  return <ChatShell />;
}
