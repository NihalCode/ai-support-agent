"use client";

import { cn } from "@/lib/cn";

export function ResultCard({
  title,
  status,
  summary,
  actions,
  className,
}: {
  title: string;
  status?: string;
  summary: string;
  actions?: string[];
  className?: string;
}) {
  return (
    <div
      className={cn("rounded-2xl border border-white/10 bg-white/[0.045] p-4 chat-fade-in", className)}
      data-testid="chat-result-card"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-medium text-white">{title}</h4>
        {status && (
          <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-200">
            {status}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-300">{summary}</p>
      {actions && actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((a) => (
            <span
              key={a}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-slate-300"
            >
              {a}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
