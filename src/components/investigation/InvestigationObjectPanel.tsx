"use client";

import { useEffect, useState } from "react";
import type { InvestigationObject } from "@/lib/support/investigation/object-types";
import { InvestigationIntegrationsPanel } from "@/components/investigation/InvestigationIntegrationsPanel";

export function InvestigationObjectPanel({ investigationId }: { investigationId?: string }) {
  const [inv, setInv] = useState<InvestigationObject | null>(null);
  const [links, setLinks] = useState<{ zendeskTicketId?: string; jiraIssueKey?: string } | null>(null);
  const [hypTitle, setHypTitle] = useState("");
  const [hypDesc, setHypDesc] = useState("");

  function refreshLinks(id: string) {
    fetch(`/api/support/investigations?id=${encodeURIComponent(id)}&links=1`)
      .then((r) => r.json())
      .then((d) => {
        if (d.links) setLinks(d.links);
      })
      .catch(() => undefined);
  }

  useEffect(() => {
    const id = investigationId;
    if (!id) {
      fetch("/api/support/investigations")
        .then((r) => r.json())
        .then((d) => {
          const first = d.investigations?.[0] ?? null;
          setInv(first);
          if (first?.id) refreshLinks(first.id);
        })
        .catch(() => undefined);
      return;
    }
    fetch(`/api/support/investigations?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((data) => {
        setInv(data);
        refreshLinks(id);
      })
      .catch(() => undefined);
  }, [investigationId]);

  async function patch(body: Record<string, unknown>) {
    if (!inv) return;
    const res = await fetch(`/api/support/investigations?id=${encodeURIComponent(inv.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setInv(await res.json());
  }

  async function exportMd() {
    if (!inv) return;
    const res = await fetch(`/api/support/investigations?id=${encodeURIComponent(inv.id)}&format=markdown`);
    const md = await res.text();
    await navigator.clipboard.writeText(md);
  }

  if (!inv) {
    return (
      <div className="ide-empty" style={{ padding: 12, fontSize: 12 }}>
        Describe the problem in plain English. The agent will start an investigation, find the relevant APIs/tickets/logs, and ask only for missing details.
      </div>
    );
  }

  const pinned = inv.evidence.filter((e) => inv.pinnedEvidence.includes(e.id));

  return (
    <div style={{ fontSize: 12 }}>
      <h3 style={{ marginTop: 0 }}>{inv.title}</h3>
      <p style={{ color: "var(--muted)" }}>{inv.status} · {inv.confidence} confidence</p>

      <section style={{ marginBottom: 16 }}>
        <strong>Pinned evidence</strong>
        {pinned.length === 0 && <p style={{ color: "var(--muted)" }}>Pin from search or tool cards.</p>}
        {pinned.map((e) => (
          <div key={e.id} style={{ borderBottom: "1px solid var(--border)", padding: "6px 0" }}>
            <span style={{ color: "var(--accent)" }}>[{e.sourceType}]</span> {e.title}
            <button type="button" className="ide-evidence-pin pinned" onClick={() => patch({ unpinEvidence: e.id })}>
              Unpin
            </button>
          </div>
        ))}
      </section>

      <section style={{ marginBottom: 16 }}>
        <strong>Hypotheses</strong>
        {inv.hypotheses.map((h) => (
          <div key={h.id} className="ide-hypothesis-card">
            <div><strong>{h.title}</strong> ({h.status})</div>
            <div style={{ color: "var(--muted)" }}>{h.description}</div>
            <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
              <button type="button" className="ide-tree-item" style={{ width: "auto" }} onClick={() => patch({ updateHypothesis: { id: h.id, status: "accepted" } })}>
                Accept
              </button>
              <button type="button" className="ide-tree-item" style={{ width: "auto" }} onClick={() => patch({ updateHypothesis: { id: h.id, status: "rejected" } })}>
                Reject
              </button>
            </div>
          </div>
        ))}
        <input className="ide-chat-input" placeholder="Hypothesis title" value={hypTitle} onChange={(e) => setHypTitle(e.target.value)} style={{ width: "100%", marginBottom: 4 }} />
        <input className="ide-chat-input" placeholder="Description" value={hypDesc} onChange={(e) => setHypDesc(e.target.value)} style={{ width: "100%", marginBottom: 4 }} />
        <button
          type="button"
          className="ide-tree-item"
          onClick={() => {
            void patch({ addHypothesis: { title: hypTitle, description: hypDesc } }).then(() => {
              setHypTitle("");
              setHypDesc("");
            });
          }}
        >
          Add hypothesis
        </button>
      </section>

      <section>
        <strong>Timeline</strong>
        <ul style={{ paddingLeft: 16, maxHeight: 120, overflow: "auto" }}>
          {inv.timeline.slice(-8).map((t) => (
            <li key={t.id}>{t.summary}</li>
          ))}
        </ul>
      </section>

      {inv.suspectedRootCause && (
        <p><strong>Root cause:</strong> {inv.suspectedRootCause}</p>
      )}

      <button type="button" className="ide-tree-item" onClick={() => void exportMd()}>
        Export Markdown report
      </button>

      {inv && (
        <InvestigationIntegrationsPanel
          investigationId={inv.id}
          links={links}
          onLinksChange={() => refreshLinks(inv.id)}
        />
      )}
    </div>
  );
}
