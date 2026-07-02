"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

export function IntentCard({
  intent,
  confidence,
  plan,
  className,
}: {
  intent: string;
  confidence?: string;
  plan?: string[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-violet-400/25 bg-violet-500/10 p-4 chat-fade-in",
        className
      )}
      data-testid="chat-intent-card"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-500/20 text-violet-200">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-medium text-white">{intent}</h4>
            {confidence && (
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300">
                {confidence}
              </span>
            )}
          </div>
          {plan && plan.length > 0 && (
            <ol className="mt-3 space-y-2">
              {plan.map((step, i) => (
                <li key={step} className="flex items-start gap-2 text-sm text-slate-300">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] text-slate-200">
                    {i + 1}
                  </span>
                  <span className="leading-6">{step}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
