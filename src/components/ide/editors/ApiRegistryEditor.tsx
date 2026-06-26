"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "../WorkspaceProvider";

interface EndpointRow {
  method: string;
  path: string;
  name: string;
}

export function ApiRegistryEditor({ specId }: { specId?: string }) {
  const { openTab } = useWorkspace();
  const [specs, setSpecs] = useState<{ id: string; name: string; sourceKind: string; authType: string; endpoints: number }[]>([]);
  const [endpoints, setEndpoints] = useState<EndpointRow[]>([]);
  const [selected, setSelected] = useState<string | null>(specId ?? null);

  useEffect(() => {
    fetch("/api/support/api-import")
      .then((r) => r.json())
      .then((d) => {
        setSpecs(d.specs ?? []);
        if (!selected && d.specs?.[0]) setSelected(d.specs[0].id);
      });
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    fetch(`/api/support/workspace?specId=${encodeURIComponent(selected)}`)
      .then((r) => r.json())
      .then((d) => setEndpoints(d.endpoints ?? []))
      .catch(() => setEndpoints([]));
  }, [selected]);

  const spec = specs.find((s) => s.id === selected);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>API Registry</h2>
      <select
        value={selected ?? ""}
        onChange={(e) => setSelected(e.target.value)}
        style={{ width: "100%", marginBottom: 12, padding: 8, background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6 }}
      >
        {specs.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.endpoints} endpoints)
          </option>
        ))}
      </select>
      {spec && (
        <p style={{ fontSize: 12, color: "var(--muted)" }}>
          {spec.sourceKind} · auth: {spec.authType}
        </p>
      )}
      <div style={{ display: "grid", gap: 4 }}>
        {endpoints.map((ep) => (
          <button
            key={`${ep.method}-${ep.path}`}
            type="button"
            className="ide-tree-item"
            onClick={() =>
              openTab({
                id: `ep-${ep.method}-${ep.path}`,
                kind: "endpoint",
                title: `${ep.method} ${ep.path}`,
                payload: { method: ep.method, path: ep.path, name: ep.name, specId: selected },
              })
            }
          >
            <span>
              <strong>{ep.method}</strong> {ep.path}
            </span>
          </button>
        ))}
        {endpoints.length === 0 && specs.length > 0 && (
          <p className="ide-empty">Loading endpoints… Run bootstrap or re-import if empty.</p>
        )}
      </div>
    </div>
  );
}
