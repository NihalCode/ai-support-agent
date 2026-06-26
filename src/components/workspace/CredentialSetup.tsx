"use client";

import { useEffect, useState } from "react";
import { Card, Badge } from "../ui";
import { integrationLabel } from "../ide/client-copy";

/** Credential setup — client-safe labels in Client Mode, detailed badges in Developer Mode. */
export function CredentialSetup({ developerMode = false }: { developerMode?: boolean }) {
  const [integrations, setIntegrations] = useState<Record<string, { configured: boolean }>>({});
  const [gaps, setGaps] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/support/status")
      .then((r) => r.json())
      .then((s) => {
        setIntegrations(s.integrations ?? {});
        const g: string[] = [];
        if (!s.integrations?.jira?.configured) {
          g.push(
            developerMode
              ? "Jira credentials missing — cannot search/create tickets until JIRA_* env vars are set."
              : "Issue tracker not connected — you can continue in docs-only mode."
          );
        }
        if (!s.integrations?.github?.configured) {
          g.push(
            developerMode
              ? "GitHub token missing — code search uses mock data."
              : "Code integration not connected — investigation uses available documentation."
          );
        }
        if (!s.integrations?.pinecone?.configured && developerMode) {
          g.push("Pinecone not configured — using in-memory vector store.");
        }
        if (!s.integrations?.openai?.configured && developerMode) {
          g.push("OpenAI key missing — analysis uses heuristic mode.");
        }
        setGaps(g);
      })
      .catch(() => undefined);
  }, [developerMode]);

  const badgeLabel = (key: string, configured: boolean) => {
    if (!developerMode) {
      const mapped = integrationLabel(
        key as "jira" | "github" | "pinecone" | "ctix",
        configured,
        false
      );
      return mapped ?? `${key}: ${configured ? "connected" : "not connected"}`;
    }
    return `${key}: ${configured ? "live" : "mock"}`;
  };

  return (
    <Card title={developerMode ? "Credentials & integrations" : "Connected systems"}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {Object.entries(integrations).map(([k, v]) => (
          <Badge key={k} label={badgeLabel(k, v.configured)} />
        ))}
      </div>
      {gaps.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--green)" }}>
          {developerMode ? "All core integrations configured." : "Core services are connected."}
        </p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--muted)" }}>
          {gaps.map((g) => (
            <li key={g} style={{ marginBottom: 6 }}>
              {g}
            </li>
          ))}
        </ul>
      )}
      {developerMode && (
        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 10 }}>
          Copy <code>.env.example</code> → <code>.env.local</code>. Never commit real keys.
        </p>
      )}
      {!developerMode && gaps.length > 0 && (
        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 10 }}>
          Switch to Developer Mode in settings to configure optional integrations.
        </p>
      )}
    </Card>
  );
}
