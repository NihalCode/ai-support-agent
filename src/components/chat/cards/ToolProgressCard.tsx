"use client";

import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

type StepStatus = "pending" | "running" | "complete" | "failed" | "unavailable";

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "complete") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
  if (status === "failed") return <XCircle className="h-3.5 w-3.5 text-red-400" />;
  if (status === "running") return <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />;
  return <Clock className="h-3.5 w-3.5 text-slate-500" />;
}

export function ToolProgressCard({
  title,
  steps,
  className,
}: {
  title: string;
  steps: { label: string; status: StepStatus }[];
  className?: string;
}) {
  return (
    <div
      className={cn("rounded-2xl border border-white/10 bg-white/[0.045] p-4 chat-fade-in", className)}
      data-testid="chat-tool-progress-card"
    >
      <h4 className="text-sm font-medium text-white">{title}</h4>
      <ul className="mt-3 space-y-2">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-sm text-slate-300">
            <StepIcon status={s.status} />
            <span>{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type { StepStatus };
