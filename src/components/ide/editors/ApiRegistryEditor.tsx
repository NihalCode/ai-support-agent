"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "../WorkspaceProvider";
import { AppSelect } from "@/components/ui/AppSelect";

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
    <div style={{ minWidth: 0, maxWidth: "100%", overflowX: "hidden" }}>
      <h2 style={{ marginTop: 0 }}>API Registry</h2>
      <AppSelect
        testId="api-registry-spec-select"
        value={selected ?? ""}
        onChange={(v) => setSelected(v)}
        aria-label="API product specification"
        className="mb-3"
        options={specs.map((s) => ({
          value: s.id,
          label: `${s.name} (${s.endpoints} endpoints)`,
        }))}
      />
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
