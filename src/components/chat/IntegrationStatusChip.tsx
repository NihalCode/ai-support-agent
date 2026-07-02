"use client";

import { cn } from "@/lib/cn";

export type IntegrationChipStatus =
  | "connected"
  | "syncing"
  | "not_connected"
  | "error"
  | "developer_only";

const DOT: Record<IntegrationChipStatus, string> = {
  connected: "bg-emerald-400",
  syncing: "bg-cyan-400 animate-pulse",
  not_connected: "bg-slate-500",
  error: "bg-red-400",
  developer_only: "bg-violet-400",
};

export function IntegrationStatusChip({
  name,
  status,
  className,
}: {
  name: string;
  status: IntegrationChipStatus;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-xs text-slate-300",
        className
      )}
      data-testid={`integration-chip-${name.toLowerCase()}`}
      data-status={status}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT[status])} />
      <span>{name}</span>
    </div>
  );
}
