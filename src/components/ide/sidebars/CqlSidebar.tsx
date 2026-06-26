"use client";

import { useState } from "react";
import { useWorkspace } from "../WorkspaceProvider";

export function CqlSidebar() {
  const { openTab } = useWorkspace();
  const [query, setQuery] = useState('type = "indicator" AND confidence_score > 80');
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function validate() {
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/support/cql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "validate", query }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult(JSON.stringify({ error: data.error ?? `HTTP ${res.status}` }, null, 2));
        return;
      }
      setResult(JSON.stringify(data, null, 2));
    } catch (e) {
      setResult(JSON.stringify({ error: e instanceof Error ? e.message : "Validate failed" }, null, 2));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 8 }}>
      <textarea
        className="ide-code-block"
        rows={4}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: "100%", marginBottom: 8 }}
      />
      <button type="button" className="ide-tree-item" onClick={() => void validate()} disabled={loading}>
        {loading ? "Validating…" : "Validate CQL"}
      </button>
      <button type="button" className="ide-tree-item" onClick={() => openTab({ id: "cql-workspace", kind: "cql", title: "CQL" })}>
        Open CQL editor
      </button>
      {result && <pre className="ide-code-block" style={{ marginTop: 8, fontSize: 11 }}>{result}</pre>}
    </div>
  );
}
