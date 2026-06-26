"use client";

import { useEffect, useState } from "react";
import { ApiRunnerPanel } from "../../workspace/ApiRunnerPanel";

interface EndpointDetail {
  method: string;
  path: string;
  name: string;
  description?: string;
  queryParams?: { name: string; required?: boolean; description?: string }[];
  pathParams?: { name: string; required?: boolean }[];
  requiredFields?: string[];
}

export function EndpointEditor({
  specId,
  method,
  path,
}: {
  specId?: string;
  method: string;
  path: string;
}) {
  const [endpoint, setEndpoint] = useState<EndpointDetail | null>(null);
  const [devMode, setDevMode] = useState(false);

  useEffect(() => {
    fetch("/api/support/status")
      .then((r) => r.json())
      .then((s) => setDevMode(Boolean(s.integrations?.ctix?.configured)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!specId) return;
    fetch(`/api/support/workspace?specId=${encodeURIComponent(specId)}`)
      .then((r) => r.json())
      .then((d) => {
        const ep = (d.endpoints as EndpointDetail[] | undefined)?.find(
          (e) => e.method === method && e.path === path
        );
        setEndpoint(ep ?? { method, path, name: path });
      })
      .catch(() => setEndpoint({ method, path, name: path }));
  }, [specId, method, path]);

  const ep = endpoint ?? { method, path, name: path };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>
        <span style={{ color: "var(--accent)" }}>{ep.method}</span> {ep.path}
      </h2>
      {ep.description && <p style={{ color: "var(--muted)" }}>{ep.description}</p>}
      {ep.queryParams && ep.queryParams.length > 0 && (
        <>
          <h3 style={{ fontSize: 13 }}>Query parameters</h3>
          <ul style={{ fontSize: 12 }}>
            {ep.queryParams.map((p) => (
              <li key={p.name}>
                <code>{p.name}</code>
                {p.required ? " (required)" : ""} — {p.description ?? ""}
              </li>
            ))}
          </ul>
        </>
      )}
      <h3 style={{ fontSize: 13, marginTop: 16 }}>API Runner</h3>
      <ApiRunnerPanel developerMode={devMode} initialMethod={method} initialPath={path} />
    </div>
  );
}
