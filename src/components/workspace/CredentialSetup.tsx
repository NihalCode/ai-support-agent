"use client";

import { useEffect, useState } from "react";
import { Card, Badge } from "../ui";

/** Developer-only credential setup — shows what's missing without exposing secrets. */
export function CredentialSetup() {
  const [integrations, setIntegrations] = useState<Record<string, { configured: boolean }>>({});
  const [gaps, setGaps] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/support/status")
      .then((r) => r.json())
      .then((s) => {
        setIntegrations(s.integrations ?? {});
        const g: string[] = [];
        if (!s.integrations?.jira?.configured) {
          g.push("Jira credentials missing — cannot search/create tickets until JIRA_* env vars are set.");
        }
        if (!s.integrations?.github?.configured) {
          g.push("GitHub token missing — code search uses mock data.");
        }
        if (!s.integrations?.pinecone?.configured) {
          g.push("Pinecone not configured — using in-memory vector store.");
        }
        if (!s.integrations?.openai?.configured) {
          g.push("OpenAI key missing — analysis uses heuristic mode.");
        }
        setGaps(g);
      })
      .catch(() => undefined);
  }, []);

  return (
    <Card title="Credentials & integrations">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {Object.entries(integrations).map(([k, v]) => (
          <Badge key={k} label={`${k}: ${v.configured ? "live" : "mock"}`} />
        ))}
      </div>
      {gaps.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--green)" }}>All core integrations configured.</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--muted)" }}>
          {gaps.map((g) => (
            <li key={g} style={{ marginBottom: 6 }}>
              {g}
            </li>
          ))}
        </ul>
      )}
      <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 10 }}>
        Copy <code>.env.example</code> → <code>.env.local</code>. Never commit real keys. Client users do not
        need developer credentials for docs-only investigation.
      </p>
    </Card>
  );
}
