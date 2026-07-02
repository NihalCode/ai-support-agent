"use client";

import { useEffect, useState } from "react";
import { SearchCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import type { IntegrationChipStatus } from "./IntegrationStatusChip";
import { IntegrationStatusChip } from "./IntegrationStatusChip";
import { useWorkspace } from "@/components/ide/WorkspaceProvider";

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
      <h3 className="text-sm font-medium text-white">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function ContextPanel({
  integrations,
  pendingApprovals,
  open,
  onClose,
}: {
  integrations: { name: string; status: IntegrationChipStatus }[];
  pendingApprovals: number;
  open?: boolean;
  onClose?: () => void;
}) {
  const { state, addChatMessage, isClientMode } = useWorkspace();
  const invId = state.activeInvestigationId;
  const [titleByInv, setTitleByInv] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!invId) return;
    let cancelled = false;
    fetch(`/api/support/investigations/${invId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) {
          setTitleByInv((prev) => ({
            ...prev,
            [invId]: data?.title ?? "Active investigation",
          }));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTitleByInv((prev) => ({ ...prev, [invId]: "Active investigation" }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [invId]);

  const investigationTitle = invId ? titleByInv[invId] : null;

  function suggest(text: string) {
    addChatMessage({ role: "user", content: text });
    onClose?.();
  }

  return (
    <aside
      className={cn(
        "chat-context-panel border-l border-white/10 bg-slate-950/45 backdrop-blur-xl p-4 min-h-0 overflow-y-auto flex flex-col gap-4",
        open && "chat-context-panel--open"
      )}
      data-testid="chat-context-panel"
    >
      <SectionCard title="Current Context">
        {invId ? (
          <dl className="space-y-2 text-sm text-slate-300">
            <div>
              <dt className="text-xs text-slate-500">Investigation</dt>
              <dd className="text-white">{investigationTitle ?? "Investigating"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Status</dt>
              <dd>Investigating</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Owner</dt>
              <dd>You</dd>
            </div>
          </dl>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.035] p-5 text-center">
            <SearchCheck className="mx-auto h-7 w-7 text-slate-500" />
            <h3 className="mt-3 text-sm font-medium text-white">No active investigation</h3>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Describe a customer issue and the agent will start one automatically.
            </p>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Linked Systems">
        <div className="flex flex-wrap gap-2">
          {integrations.map((i) => (
            <IntegrationStatusChip key={i.name} name={i.name} status={i.status} />
          ))}
        </div>
        {integrations.every((i) => i.status === "not_connected") && (
          <p className="mt-3 text-sm leading-6 text-slate-400">
            No support systems connected yet. Admins can connect Slack, Zendesk, Confluence, and Jira in Settings.
          </p>
        )}
      </SectionCard>

      <SectionCard title="Suggested Actions">
        <div className="flex flex-col gap-2">
          {[
            "Draft customer reply",
            "Generate developer handoff",
            "Search Confluence",
            "Create Jira issue",
            "Send Slack summary",
          ].map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => suggest(label)}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-left text-sm text-slate-300 transition-all hover:border-violet-400/25 hover:bg-white/[0.07]"
            >
              {label}
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Pending Approvals">
        {pendingApprovals > 0 ? (
          <p className="text-sm text-amber-200">{pendingApprovals} approval(s) waiting for review</p>
        ) : (
          <p className="text-sm text-slate-400">No pending approvals</p>
        )}
      </SectionCard>

      <SectionCard title="Confidence / Missing Details">
        <p className="text-sm leading-6 text-slate-400">
          {state.investigationSessionId
            ? "Session active — the agent can reference prior context."
            : "Share ticket IDs, timestamps, or error messages for higher confidence."}
        </p>
        {!isClientMode && state.problems.length > 0 && (
          <p className="mt-2 text-xs text-amber-300">{state.problems.length} issue(s) in Problems panel</p>
        )}
      </SectionCard>
    </aside>
  );
}
