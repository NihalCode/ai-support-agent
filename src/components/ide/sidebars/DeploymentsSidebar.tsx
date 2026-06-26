"use client";

import { useEffect, useState } from "react";

interface DepRow {
  id: string;
  url: string;
  target: string;
  mock: boolean;
  projectName: string;
  createdAt: string;
}

export function DeploymentsSidebar() {
  const [rows, setRows] = useState<DepRow[]>([]);

  useEffect(() => {
    fetch("/api/support/build-app")
      .then((r) => r.json())
      .then((d) => {
        const out: DepRow[] = [];
        for (const p of d.projects ?? []) {
          for (const dep of p.deployments ?? []) {
            out.push({
              id: dep.id,
              url: dep.url,
              target: dep.target,
              mock: dep.mock,
              projectName: p.name,
              createdAt: dep.createdAt,
            });
          }
        }
        setRows(out);
      })
      .catch(() => undefined);
  }, []);

  return (
    <div data-testid="deployments-sidebar" style={{ padding: 8, fontSize: 12 }}>
      <p style={{ color: "var(--muted)" }}>Vercel deployments from Build App projects.</p>
      {rows.length === 0 && <p style={{ color: "var(--muted)" }}>No deployments yet.</p>}
      {rows.map((r) => (
        <div key={r.id} style={{ borderBottom: "1px solid var(--border)", padding: "8px 0" }}>
          <strong>{r.projectName}</strong> · {r.target}
          {r.mock && <span style={{ color: "var(--muted)" }}> (mock)</span>}
          <br />
          <a href={r.url} style={{ fontSize: 11 }}>
            {r.url}
          </a>
        </div>
      ))}
    </div>
  );
}
