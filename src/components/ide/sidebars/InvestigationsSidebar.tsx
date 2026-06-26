"use client";

import { useEffect, useState } from "react";
import { parseInvestigationsListResponse } from "@/lib/support/ide-api";
import { useWorkspace } from "../WorkspaceProvider";

export function InvestigationsSidebar() {
  const { runCommand, openTab } = useWorkspace();
  const [items, setItems] = useState<{ id: string; title: string; status?: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/support/investigations")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
        setItems(parseInvestigationsListResponse(data).investigations);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  return (
    <div style={{ padding: 8 }} data-testid="investigations-sidebar">
      <button type="button" className="ide-tree-item" onClick={() => runCommand("investigate")}>
        + New investigation
      </button>
      {error && <p style={{ fontSize: 11, color: "var(--amber)", padding: "4px 12px" }}>{error}</p>}
      {items.length === 0 && !error && (
        <p style={{ padding: "8px 12px", color: "var(--muted)", fontSize: 12 }}>
          No saved investigations yet. Start one from Welcome or the command palette.
        </p>
      )}
      {items.map((inv) => (
        <button
          key={inv.id}
          type="button"
          className="ide-tree-item"
          data-testid={`investigation-${inv.id}`}
          onClick={() =>
            openTab({
              id: `inv-${inv.id}`,
              kind: "investigation-object",
              title: inv.title,
              payload: { investigationId: inv.id },
            })
          }
        >
          <span>{inv.title}</span>
          {inv.status && <span className="muted">{inv.status}</span>}
        </button>
      ))}
    </div>
  );
}
