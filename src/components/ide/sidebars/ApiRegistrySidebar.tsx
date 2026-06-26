"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "../WorkspaceProvider";

export function ApiRegistrySidebar() {
  const { openTab } = useWorkspace();
  const [specs, setSpecs] = useState<{ id: string; name: string; endpoints: number }[]>([]);

  useEffect(() => {
    fetch("/api/support/api-import")
      .then((r) => r.json())
      .then((d) => setSpecs(d.specs ?? []));
  }, []);

  return (
    <div style={{ padding: "4px 0" }}>
      {specs.map((s) => (
        <button
          key={s.id}
          type="button"
          className="ide-tree-item"
          onClick={() =>
            openTab({ id: `registry-${s.id}`, kind: "api-registry", title: s.name, payload: { specId: s.id } })
          }
        >
          <span>{s.name}</span>
          <span className="muted">{s.endpoints} ep</span>
        </button>
      ))}
      {specs.length === 0 && <p className="ide-empty">No imported APIs — use Import from Explorer.</p>}
    </div>
  );
}
