"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";

export function FriendlyErrorCard({
  title,
  message,
  impact,
  actionLabel,
  onAction,
  technicalDetails,
  developerMode,
  className,
}: {
  title: string;
  message: string;
  impact?: string;
  actionLabel?: string;
  onAction?: () => void;
  technicalDetails?: string;
  developerMode?: boolean;
  className?: string;
}) {
  const [showTech, setShowTech] = useState(developerMode && Boolean(technicalDetails));

  return (
    <div
      className={cn("rounded-2xl border border-red-400/20 bg-red-500/10 p-4 chat-fade-in", className)}
      data-testid="chat-error-card"
    >
      <div className="flex gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-red-300" />
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-medium text-white">{title}</h4>
          <p className="mt-1 text-sm leading-6 text-slate-200">{message}</p>
          {impact && <p className="mt-2 text-sm text-slate-400">{impact}</p>}
          {actionLabel && onAction && (
            <button
              type="button"
              onClick={onAction}
              className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white transition-all hover:bg-white/10"
            >
              {actionLabel}
            </button>
          )}
          {technicalDetails && !developerMode && (
            <button
              type="button"
              onClick={() => setShowTech((v) => !v)}
              className="mt-3 text-xs text-slate-400 underline-offset-2 hover:underline"
              data-testid="chat-error-show-technical"
            >
              {showTech ? "Hide technical details" : "Show technical details"}
            </button>
          )}
          {showTech && technicalDetails && (
            <pre
              className="mt-2 max-h-32 overflow-auto rounded-lg border border-white/8 bg-black/30 p-2 text-xs text-slate-400"
              data-testid="chat-error-technical"
            >
              {technicalDetails}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
