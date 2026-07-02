"use client";

import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";

export function ApprovalCard({
  title,
  description,
  risk,
  target,
  preview,
  onApprove,
  onReject,
  busy,
  className,
}: {
  title: string;
  description: string;
  risk?: string;
  target?: string;
  preview?: string;
  onApprove?: () => void;
  onReject?: () => void;
  busy?: boolean;
  className?: string;
}) {
  const highRisk = risk === "High" || risk === "Medium";
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 chat-fade-in",
        highRisk ? "border-amber-400/25 bg-amber-500/10" : "border-white/10 bg-white/[0.045]",
        className
      )}
      data-testid="chat-approval-card"
    >
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 text-amber-300" />
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-medium text-white">{title}</h4>
          <p className="mt-1 text-sm leading-6 text-slate-300">{description}</p>
          {target && <p className="mt-2 text-xs text-slate-400">Target: {target}</p>}
          {preview && (
            <pre className="mt-2 max-h-24 overflow-auto rounded-lg border border-white/8 bg-black/20 p-2 text-xs text-slate-300">
              {preview}
            </pre>
          )}
          {(onApprove || onReject) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {onApprove && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onApprove}
                  className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-200 transition-all hover:bg-emerald-500/30 disabled:opacity-50"
                >
                  Approve
                </button>
              )}
              {onReject && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onReject}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition-all hover:bg-white/5 disabled:opacity-50"
                >
                  Reject
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
