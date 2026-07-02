"use client";

import { useEffect, useState } from "react";
import type { NormalizedIssue } from "@/lib/support/types";
import { parseTicketRefResponse } from "@/lib/support/ide-api";

export function JiraTicketEditor({ ticketKey }: { ticketKey: string }) {
  const [issue, setIssue] = useState<NormalizedIssue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticketKey) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setLoading(true);
        setError(null);
      }
    });
    fetch(`/api/support/tickets?ref=${encodeURIComponent(ticketKey)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        const parsed = parseTicketRefResponse(data);
        if (!parsed.issue) throw new Error(`Ticket ${ticketKey} not found.`);
        setIssue(parsed.issue);
      })
      .catch((e) => {
        setIssue(null);
        setError(e instanceof Error ? e.message : "Failed to load ticket");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticketKey]);

  if (loading) return <p style={{ color: "var(--muted)" }}>Loading {ticketKey}…</p>;
  if (error) return <p style={{ color: "var(--amber)" }}>{error}</p>;
  if (!issue) return <p style={{ color: "var(--muted)" }}>No ticket data.</p>;

  return (
    <div data-testid="jira-ticket-editor">
      <h2 style={{ marginTop: 0 }}>
        <a href={issue.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
          {issue.key}
        </a>
        {" · "}
        {issue.title}
      </h2>
      <p style={{ color: "var(--muted)", fontSize: 12 }}>
        {issue.state}
        {issue.priority ? ` · ${issue.priority}` : ""}
        {issue.assignee ? ` · ${issue.assignee}` : ""}
      </p>
      {issue.body && (
        <section style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 13 }}>Description</h3>
          <pre className="ide-code-block" style={{ whiteSpace: "pre-wrap" }}>
            {issue.body}
          </pre>
        </section>
      )}
      {issue.comments.length > 0 && (
        <section style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 13 }}>Comments</h3>
          {issue.comments.map((c, i) => (
            <div key={i} style={{ borderBottom: "1px solid var(--border)", padding: "8px 0" }}>
              <strong>{c.author}</strong>
              {c.createdAt && <span style={{ color: "var(--muted)", fontSize: 11 }}> · {c.createdAt}</span>}
              <p style={{ margin: "4px 0 0", fontSize: 13 }}>{c.body}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
