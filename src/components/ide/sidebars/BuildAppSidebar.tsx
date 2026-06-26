"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "../WorkspaceProvider";

export function BuildAppSidebar() {
  const { openTab } = useWorkspace();
  const [projects, setProjects] = useState<{ id: string; name: string; status: string }[]>([]);

  useEffect(() => {
    fetch("/api/support/build-app")
      .then((r) => r.json())
      .then((d) => setProjects(d.projects ?? []))
      .catch(() => undefined);
  }, []);

  return (
    <div data-testid="build-app-sidebar" style={{ padding: 8, fontSize: 12 }}>
      <p style={{ color: "var(--muted)" }}>Scaffold Cyware API apps from chat. Secrets stay server-side.</p>
      <button
        type="button"
        data-testid="build-app-new"
        className="ide-tree-item"
        style={{ width: "100%", marginBottom: 8 }}
        onClick={() =>
          openTab({ id: "build-app-new", kind: "build-app", title: "Build App" })
        }
      >
        + New app
      </button>
      {projects.map((p) => (
        <button
          key={p.id}
          type="button"
          data-testid={`build-app-project-${p.id.slice(0, 8)}`}
          className="ide-tree-item"
          style={{ width: "100%", textAlign: "left", marginBottom: 4 }}
          onClick={() =>
            openTab({
              id: `build-app-${p.id}`,
              kind: "build-app",
              title: p.name,
              payload: { projectId: p.id },
            })
          }
        >
          {p.name} <span style={{ color: "var(--muted)" }}>({p.status})</span>
        </button>
      ))}
    </div>
  );
}
