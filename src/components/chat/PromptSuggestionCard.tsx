"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export function PromptSuggestionCard({
  title,
  example,
  icon: Icon,
  onClick,
  testId,
}: {
  title: string;
  example: string;
  icon: LucideIcon;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "group rounded-2xl border border-white/10 bg-white/[0.045] p-4 text-left transition-all duration-200",
        "hover:border-violet-400/30 hover:bg-white/[0.075] hover:shadow-[0_0_35px_rgba(139,92,246,0.12)]"
      )}
    >
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white/8 text-violet-200">
        <Icon className="h-4 w-4" />
      </div>
      <div className="font-medium text-white">{title}</div>
      <div className="mt-1 text-sm leading-6 text-slate-400">&ldquo;{example}&rdquo;</div>
    </button>
  );
}
