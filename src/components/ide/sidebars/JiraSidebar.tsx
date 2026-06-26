"use client";

import { useState } from "react";
import { useWorkspace } from "../WorkspaceProvider";

export function JiraSidebar() {
  const { openTab } = useWorkspace();
  const [q, setQ] = useState("");
  const [tickets, setTickets] = useState<{ key?: string; title?: string }[]>([]);
  const [mock, setMock] = useState(false);

  async function search() {
    const res = await fetch(`/api/support/tickets?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setTickets(data.tickets ?? []);
    setMock(Boolean(data.mock));
  }

  return (
    <div style={{ padding: 8 }}>
      <input
        className="ide-chat-input"
        placeholder="Search Jira…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && search()}
        style={{ width: "100%", marginBottom: 8 }}
      />
      <button type="button" className="ide-tree-item" onClick={search}>
        Search
      </button>
      {mock && <p style={{ fontSize: 11, color: "var(--amber)", padding: "4px 12px" }}>Jira credentials missing — mock tickets.</p>}
      {tickets.map((t) => (
        <button
          key={t.key ?? t.title}
          type="button"
          className="ide-tree-item"
          onClick={() =>
            openTab({
              id: `jira-${t.key}`,
              kind: "jira-ticket",
              title: t.key ?? "Ticket",
              payload: { key: t.key, title: t.title },
            })
          }
        >
          {t.key}: {t.title}
        </button>
      ))}
    </div>
  );
}
