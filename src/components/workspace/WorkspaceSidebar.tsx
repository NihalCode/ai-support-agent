"use client";

import { useEffect, useState } from "react";
import { Badge, Spinner } from "../ui";

export interface WorkspaceSource {
  id: string;
  label: string;
  kind: "api-spec" | "cql" | "repo" | "jira" | "logs" | "mcp";
  count?: number;
  configured?: boolean;
}

interface Props {
  onSelectSource?: (source: WorkspaceSource) => void;
  activeSessionId?: string;
}

export function WorkspaceSidebar({ onSelectSource, activeSessionId }: Props) {
  const [sources, setSources] = useState<WorkspaceSource[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/support/api-import").then((r) => r.json()),
      fetch("/api/support/status").then((r) => r.json()),
      fetch("/api/support/bootstrap").then((r) => r.json()).catch(() => null),
    ])
      .then(([imports, status, bootstrap]) => {
        const specs = (imports.specs ?? []) as { id: string; name: string; endpoints: number }[];
        const items: WorkspaceSource[] = specs.map((s) => ({
          id: s.id,
          label: s.name,
          kind: "api-spec",
          count: s.endpoints,
        }));
        if (bootstrap?.cql?.chunks) {
          items.push({ id: "cql-docs", label: "CQL documentation", kind: "cql", count: bootstrap.cql.chunks });
        }
        items.push({
          id: "github",
          label: status?.integrations?.github?.defaultRepo ?? "GitHub repo",
          kind: "repo",
          configured: status?.integrations?.github?.configured,
        });
        items.push({
          id: "jira",
          label: `Jira ${status?.integrations?.jira?.projectKey ?? ""}`.trim(),
          kind: "jira",
          configured: status?.integrations?.jira?.configured,
        });
        items.push({
          id: "vercel-logs",
          label: "Vercel logs / deploys",
          kind: "logs",
          configured: status?.integrations?.vercel?.configured,
        });
        setSources(items);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <aside
      style={{
        width: 220,
        flexShrink: 0,
        borderRight: "1px solid var(--border)",
        padding: "12px 10px",
        fontSize: 13,
        overflowY: "auto",
        maxHeight: "calc(100vh - 120px)",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 11, color: "var(--muted)", marginBottom: 10, letterSpacing: 0.5 }}>
        WORKSPACE
      </div>
      {loading && <Spinner label="Loading sources…" />}
      {!loading &&
        sources.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelectSource?.(s)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              textAlign: "left",
              background: "transparent",
              border: "none",
              color: "var(--text)",
              padding: "6px 8px",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            <span style={{ opacity: 0.7 }}>{iconFor(s.kind)}</span>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.label}
            </span>
            {s.count !== undefined && (
              <span style={{ color: "var(--muted)", fontSize: 11 }}>{s.count}</span>
            )}
            {s.configured === false && <Badge label="mock" />}
          </button>
        ))}
      {activeSessionId && (
        <div style={{ marginTop: 16, fontSize: 11, color: "var(--muted)" }}>
          Session: {activeSessionId.slice(0, 8)}…
        </div>
      )}
    </aside>
  );
}

function iconFor(kind: WorkspaceSource["kind"]): string {
  switch (kind) {
    case "api-spec":
      return "📡";
    case "cql":
      return "🔍";
    case "repo":
      return "📁";
    case "jira":
      return "🎫";
    case "logs":
      return "📋";
    case "mcp":
      return "🔌";
    default:
      return "•";
  }
}
