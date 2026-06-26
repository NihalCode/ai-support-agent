"use client";

import { useState } from "react";
import type { InvestigationContext } from "@/lib/support/investigation/types";
import { Card } from "../ui";

type Tab = "jira" | "code" | "logs" | "deployments" | "docs" | "patch";

export function EvidencePanel({ context }: { context: InvestigationContext | null }) {
  const [tab, setTab] = useState<Tab>("jira");

  if (!context) {
    return (
      <Card title="Evidence">
        <p style={{ color: "var(--muted)", fontSize: 13 }}>Start an investigation from chat or the form to populate evidence tabs.</p>
      </Card>
    );
  }

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "jira", label: "Jira", count: context.jira.tickets.length },
    { id: "code", label: "Code", count: context.code.files.length },
    { id: "logs", label: "Logs", count: context.logs.entries.length },
    { id: "deployments", label: "Deploys", count: context.deployments.deployments.length },
    { id: "docs", label: "API docs", count: context.docs.docs.length },
    { id: "patch", label: "Fix", count: context.fixProposal.fixable ? 1 : 0 },
  ];

  return (
    <Card title="Evidence">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              fontSize: 12,
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: tab === t.id ? "var(--surface)" : "transparent",
              color: tab === t.id ? "var(--text)" : "var(--muted)",
              cursor: "pointer",
            }}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>
      <EvidenceList items={itemsForTab(context, tab)} empty={`No ${tab} evidence.`} />
    </Card>
  );
}

function itemsForTab(ctx: InvestigationContext, tab: Tab) {
  switch (tab) {
    case "jira":
      return ctx.jira.tickets;
    case "code":
      return [...ctx.code.files, ...ctx.code.commits, ...ctx.code.pullRequests];
    case "logs":
      return ctx.logs.entries;
    case "deployments":
      return ctx.deployments.deployments;
    case "docs":
      return ctx.docs.docs;
    case "patch":
      return ctx.fixProposal.fixable
        ? [
            {
              id: "fix",
              sourceType: "code" as const,
              title: "Fix proposal",
              summary: ctx.fixProposal.proposedChange ?? ctx.fixProposal.suspectedRootCause,
            },
          ]
        : [];
  }
}

function EvidenceList({
  items,
  empty,
}: {
  items: { id: string; title: string; summary: string; url?: string }[];
  empty: string;
}) {
  if (!items.length) return <p style={{ color: "var(--muted)", fontSize: 13 }}>{empty}</p>;
  return (
    <div style={{ display: "grid", gap: 8, maxHeight: 480, overflow: "auto" }}>
      {items.map((item) => (
        <details
          key={item.id}
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 8,
            background: "var(--surface-2)",
          }}
        >
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>{item.title}</summary>
          <p style={{ fontSize: 12, margin: "8px 0 0", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{item.summary}</p>
          {item.url && (
            <a href={item.url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
              Open
            </a>
          )}
        </details>
      ))}
    </div>
  );
}
