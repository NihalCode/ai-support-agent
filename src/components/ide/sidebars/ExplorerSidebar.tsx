"use client";

import { useEffect, useState } from "react";
import { explorerRepoLabel } from "../client-copy";
import { useWorkspace } from "../WorkspaceProvider";

interface SpecSummary {
  id: string;
  name: string;
  endpoints: number;
  sourceKind: string;
}

export function ExplorerSidebar() {
  const { openTab, runCommand, isClientMode } = useWorkspace();
  const [specs, setSpecs] = useState<SpecSummary[]>([]);
  const [repo, setRepo] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/support/api-import").then((r) => r.json()),
      fetch("/api/support/status").then((r) => r.json()),
    ]).then(([imports, status]) => {
      setSpecs(imports.specs ?? []);
      setRepo(status?.integrations?.github?.defaultRepo ?? "");
    });
  }, []);

  return (
    <div style={{ padding: "4px 0" }}>
      <Section label="Repository">
        <TreeItem label={explorerRepoLabel(repo || null, !isClientMode)} onClick={() => openTab({ id: "integrations", kind: "integrations", title: "Integrations" })} />
      </Section>
      <Section label="API Sources">
        {specs.map((s) => (
          <TreeItem
            key={s.id}
            label={s.name}
            meta={String(s.endpoints)}
            onClick={() =>
              openTab({
                id: `registry-${s.id}`,
                kind: "api-registry",
                title: s.name,
                payload: { specId: s.id },
              })
            }
          />
        ))}
        <TreeItem label="+ Import source…" onClick={() => runCommand("import-api")} />
      </Section>
      <Section label="Docs & tools">
        <TreeItem label="CQL documentation" onClick={() => runCommand("cql")} />
        <TreeItem label="MCP servers" onClick={() => runCommand("mcp")} />
        <TreeItem label="Saved investigations" onClick={() => runCommand("investigate")} />
      </Section>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ padding: "6px 12px", fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function TreeItem({ label, meta, onClick }: { label: string; meta?: string; onClick?: () => void }) {
  return (
    <button type="button" className="ide-tree-item" onClick={onClick}>
      <span>{label}</span>
      {meta && <span className="muted">{meta}</span>}
    </button>
  );
}
