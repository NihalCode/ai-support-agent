import type { ChatMode } from "./types";

export const CHAT_MODE_LABELS: Record<ChatMode, string> = {
  instant: "Instant",
  balanced: "Balanced",
  deep: "Deep",
  developer: "Developer",
};

export const CHAT_MODE_DESCRIPTIONS: Record<ChatMode, string> = {
  instant: "Fast answers, simple routing, best for quick summaries and small edits.",
  balanced: "Default mode. Good mix of speed, reliability, and tool use.",
  deep: "More careful planning, deeper file analysis, stronger verification.",
  developer: "Advanced mode with technical details, logs, diffs, and diagnostics.",
};

export function normalizeChatMode(mode: string | undefined, canUseDeveloperMode: boolean): ChatMode {
  if (mode === "developer" && !canUseDeveloperMode) return "balanced";
  if (mode === "instant" || mode === "balanced" || mode === "deep" || mode === "developer") {
    return mode;
  }
  return "balanced";
}

export function modeBehavior(mode: ChatMode): {
  maxToolSteps: number;
  askFollowUps: boolean;
  fullBuildVerification: boolean;
  showTechnicalDetails: boolean;
} {
  switch (mode) {
    case "instant":
      return { maxToolSteps: 2, askFollowUps: false, fullBuildVerification: false, showTechnicalDetails: false };
    case "deep":
      return { maxToolSteps: 8, askFollowUps: true, fullBuildVerification: true, showTechnicalDetails: false };
    case "developer":
      return { maxToolSteps: 10, askFollowUps: true, fullBuildVerification: true, showTechnicalDetails: true };
    default:
      return { maxToolSteps: 5, askFollowUps: true, fullBuildVerification: false, showTechnicalDetails: false };
  }
}

export function modeLabel(mode: ChatMode): string {
  return CHAT_MODE_LABELS[mode];
}
