"use client";

import { useState } from "react";
import type { SearchMode, WorkspaceSearchResult } from "@/lib/support/search/types";
import { useWorkspace } from "../WorkspaceProvider";

const SOURCE_TYPES = [
  "api-doc",
  "postman",
  "openapi",
  "cql",
  "code",
  "jira",
  "logs",
  "investigation",
] as const;

export function SearchSidebar() {
  const { openTabFromTarget, openTab, pinEvidenceToInvestigation, compareWithActive } = useWorkspace();
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<SearchMode>("hybrid");
  const [filterType, setFilterType] = useState<string>("");
  const [results, setResults] = useState<WorkspaceSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [degraded, setDegraded] = useState<string | null>(null);

  async function search() {
    if (!q.trim()) return;
    setLoading(true);
    setDegraded(null);
    try {
      const res = await fetch("/api/support/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          mode,
          filters: filterType ? { sourceTypes: [filterType] } : undefined,
          topK: 25,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResults([]);
        setDegraded(data.error ?? `Search failed (${res.status})`);
        return;
      }
      setResults(data.results ?? []);
      if (data.degradedReason) setDegraded(data.degradedReason);
    } finally {
      setLoading(false);
    }
  }

  function openResult(r: WorkspaceSearchResult, side = false) {
    openTabFromTarget(r.openTarget, side);
  }

  const grouped = results.reduce<Record<string, WorkspaceSearchResult[]>>((acc, r) => {
    (acc[r.sourceType] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div style={{ padding: 8 }} data-testid="search-sidebar">
      <input
        className="ide-chat-input"
        placeholder="Search workspace…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && search()}
        style={{ width: "100%", marginBottom: 8 }}
        data-testid="search-input"
      />
      <div className="ide-search-mode">
        {(["keyword", "semantic", "hybrid"] as SearchMode[]).map((m) => (
          <button
            key={m}
            type="button"
            className={mode === m ? "active" : ""}
            onClick={() => setMode(m)}
            data-testid={`search-mode-${m}`}
          >
            {m}
          </button>
        ))}
      </div>
      <select
        value={filterType}
        onChange={(e) => setFilterType(e.target.value)}
        style={{ width: "100%", marginBottom: 8, padding: 6, background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6 }}
      >
        <option value="">All source types</option>
        {SOURCE_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <button type="button" className="ide-tree-item" onClick={search} disabled={loading} data-testid="search-submit">
        {loading ? "Searching…" : "Search"}
      </button>
      {degraded && (
        <p style={{ fontSize: 11, color: "var(--amber)", margin: "8px 0" }} data-testid="search-degraded">
          {degraded}
        </p>
      )}
      {results.length === 0 && !loading && q && (
        <p className="ide-empty" style={{ padding: 12 }} data-testid="search-empty">
          No results found.
        </p>
      )}
      {Object.entries(grouped).map(([type, items]) => (
        <div key={type} style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase" }}>{type}</div>
          {items.map((r) => (
            <div
              key={r.id}
              className="ide-tree-item"
              style={{ flexDirection: "column", alignItems: "flex-start" }}
              onContextMenu={(e) => {
                e.preventDefault();
                openResult(r, true);
              }}
            >
              <div style={{ display: "flex", width: "100%", gap: 4 }}>
                <button type="button" style={{ flex: 1, background: "none", border: "none", color: "inherit", textAlign: "left", cursor: "pointer" }} onClick={() => openResult(r)}>
                  {r.title}
                </button>
                {r.score !== undefined && (
                  <span className="muted" style={{ fontSize: 10 }}>
                    {(r.score * 100).toFixed(0)}%
                  </span>
                )}
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>{r.sourceName}</div>
              <div style={{ fontSize: 11, marginTop: 2 }}>{r.matchedText.slice(0, 100)}</div>
              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                <button type="button" className="ide-evidence-pin" onClick={() => openResult(r, true)}>
                  Open to side
                </button>
                <button
                  type="button"
                  className="ide-evidence-pin"
                  data-testid="pin-evidence"
                  onClick={() =>
                    void pinEvidenceToInvestigation(r.id, {
                      sourceType: r.sourceType,
                      sourceName: r.sourceName,
                      title: r.title,
                      matchedText: r.matchedText,
                      openTarget: r.openTarget,
                    })
                  }
                >
                  Pin
                </button>
                <button type="button" className="ide-evidence-pin" onClick={() => compareWithActive({ id: r.openTarget.tabId, kind: r.openTarget.kind as "endpoint", title: r.title, payload: r.openTarget.payload })}>
                  Compare
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
