"use client";

import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";

export function EvidenceCard({
  sources,
  className,
}: {
  sources: { type: string; title: string; subtitle?: string }[];
  className?: string;
}) {
  if (!sources.length) return null;
  return (
    <div
      className={cn("rounded-2xl border border-white/10 bg-white/[0.045] p-4 chat-fade-in", className)}
      data-testid="chat-evidence-card"
    >
      <h4 className="text-sm font-medium text-white">Evidence</h4>
      <ul className="mt-3 space-y-2">
        {sources.map((s) => (
          <li
            key={`${s.type}-${s.title}`}
            className="flex items-start justify-between gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2"
          >
            <div className="min-w-0">
              <div className="text-xs text-violet-200">{s.type}</div>
              <div className="text-sm font-medium text-white">{s.title}</div>
              {s.subtitle && <div className="text-xs text-slate-400">{s.subtitle}</div>}
            </div>
            <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-500" />
          </li>
        ))}
      </ul>
    </div>
  );
}
