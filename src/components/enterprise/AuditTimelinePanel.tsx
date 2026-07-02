"use client";

import { useEffect, useMemo, useState } from "react";
import type { EnterpriseAuditLog } from "@/lib/support/enterprise/types";
import { groupAuditTimeline, type AuditTimelineGroup } from "@/lib/support/enterprise/group-audit-timeline";

function statusColor(status: string): string {
  if (status === "completed" || status === "approved") return "var(--green, #22c55e)";
  if (status === "failed" || status === "rejected") return "var(--red, #ef4444)";
  if (status === "requested") return "var(--amber, #f59e0b)";
  return "var(--muted)";
}

function TimelineGroupCard({ group }: { group: AuditTimelineGroup }) {
  const [open, setOpen] = useState(true);
  return (
    <section
      className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden"
      data-testid={`audit-timeline-group-${group.kind}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.03]"
      >
        <div>
          <div className="text-sm font-medium text-white">{group.title}</div>
          {group.subtitle && <div className="mt-0.5 text-xs text-slate-400">{group.subtitle}</div>}
          <div className="mt-1 text-[11px] text-slate-500">
            {group.entries.length} event{group.entries.length === 1 ? "" : "s"} ·{" "}
            {new Date(group.startedAt).toLocaleString()} → {new Date(group.lastAt).toLocaleString()}
          </div>
        </div>
        <span className="text-xs text-slate-500">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <ol className="border-t border-white/8 px-4 py-2 space-y-2" data-testid="audit-timeline-events">
          {group.entries.map((e) => (
            <li
              key={e.id}
              className="relative pl-4 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-violet-400/80"
            >
              <div className="text-xs text-white">
                <strong>{e.action}</strong>{" "}
                <span style={{ color: statusColor(e.status) }}>{e.status}</span>
              </div>
              <div className="text-[11px] text-slate-400">
                {e.actorEmail ?? e.actorUserId} · {e.targetSystem}
                {e.targetId ? ` · ${e.targetId}` : ""} · {new Date(e.createdAt).toLocaleString()}
              </div>
              {typeof e.metadata?.details === "string" && e.metadata.details && (
                <div className="mt-1 text-[11px] text-slate-500 line-clamp-2">{e.metadata.details}</div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function AuditTimelinePanel() {
  const [entries, setEntries] = useState<EnterpriseAuditLog[]>([]);
  const [actionFilter, setActionFilter] = useState("");
  const [systemFilter, setSystemFilter] = useState("");

  useEffect(() => {
    const params = new URLSearchParams({ limit: "200" });
    if (actionFilter) params.set("action", actionFilter);
    if (systemFilter) params.set("targetSystem", systemFilter);
    fetch(`/api/support/audit?${params}`)
      .then((r) => r.json())
      .then((d) => setEntries(Array.isArray(d.entries) ? d.entries : []))
      .catch(() => setEntries([]));
  }, [actionFilter, systemFilter]);

  const groups = useMemo(() => groupAuditTimeline(entries), [entries]);

  return (
    <div data-testid="audit-logs-panel">
      <div className="mb-4 flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-xs text-slate-300">
          Action
          <input
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-xs text-white"
            placeholder="slack, approval…"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          System
          <select
            value={systemFilter}
            onChange={(e) => setSystemFilter(e.target.value)}
            className="rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-xs text-white"
          >
            <option value="">All</option>
            <option value="slack">Slack</option>
            <option value="jira">Jira</option>
            <option value="zendesk">Zendesk</option>
            <option value="vercel">Vercel</option>
            <option value="app">App</option>
          </select>
        </label>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.035] p-6 text-center text-sm text-slate-400">
          No audit events yet.
        </div>
      ) : (
        <div className="space-y-3 max-h-[640px] overflow-y-auto">
          {groups.map((g) => (
            <TimelineGroupCard key={g.id} group={g} />
          ))}
        </div>
      )}
    </div>
  );
}
