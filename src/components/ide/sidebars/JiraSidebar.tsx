"use client";

import { useState } from "react";
import {
  JIRA_ISSUE_KEY,
  parseTicketRefResponse,
  parseTicketsSearchResponse,
  type TicketListItem,
} from "@/lib/support/ide-api";
import { useWorkspace } from "../WorkspaceProvider";

export function JiraSidebar() {
  const { openTab } = useWorkspace();
  const [q, setQ] = useState("");
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [mock, setMock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openTicket(t: TicketListItem) {
    openTab({
      id: `jira-${t.key}`,
      kind: "jira-ticket",
      title: t.key ?? "Ticket",
      payload: { key: t.key, title: t.title },
    });
  }

  async function search() {
    const query = q.trim();
    if (!query) {
      setError("Enter a ticket key (e.g. AISUP5-1) or search text.");
      setTickets([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (JIRA_ISSUE_KEY.test(query)) {
        const res = await fetch(`/api/support/tickets?ref=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        const parsed = parseTicketRefResponse(data);
        setMock(parsed.mock);
        if (parsed.ticket) {
          setTickets([parsed.ticket]);
          openTicket(parsed.ticket);
        } else {
          setTickets([]);
          setError(`No ticket found for ${query}.`);
        }
        return;
      }

      const res = await fetch(`/api/support/tickets?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      const parsed = parseTicketsSearchResponse(data);
      setTickets(parsed.tickets);
      setMock(parsed.mock);
      if (parsed.tickets.length === 0) {
        setError(`No Jira matches for "${query}". Try a ticket key like AISUP5-1.`);
      }
    } catch (e) {
      setTickets([]);
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 8 }} data-testid="jira-sidebar">
      <input
        className="ide-chat-input"
        placeholder="Ticket key (AISUP5-1) or keywords…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void search()}
        style={{ width: "100%", marginBottom: 8 }}
        data-testid="jira-search-input"
      />
      <button
        type="button"
        className="ide-tree-item"
        onClick={() => void search()}
        disabled={loading}
        data-testid="jira-search-submit"
      >
        {loading ? "Searching…" : "Search"}
      </button>
      {mock && (
        <p style={{ fontSize: 11, color: "var(--amber)", padding: "4px 12px" }}>
          Jira credentials missing — mock tickets.
        </p>
      )}
      {error && (
        <p style={{ fontSize: 11, color: "var(--amber)", padding: "4px 12px" }} data-testid="jira-search-error">
          {error}
        </p>
      )}
      {tickets.map((t) => (
        <button
          key={t.key ?? t.title}
          type="button"
          className="ide-tree-item"
          onClick={() => openTicket(t)}
          data-testid={`jira-result-${t.key}`}
        >
          {t.key}: {t.title}
        </button>
      ))}
    </div>
  );
}
