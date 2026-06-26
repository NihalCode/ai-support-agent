"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "./WorkspaceProvider";

export function StatusBar() {
  const { state, setBottomTab } = useWorkspace();
  const [integrations, setIntegrations] = useState<Record<string, { configured: boolean }>>({});

  useEffect(() => {
    fetch("/api/support/status")
      .then((r) => r.json())
      .then((s) => setIntegrations(s.integrations ?? {}))
      .catch(() => undefined);
  }, []);

  const warnCount = state.problems.length;
  const jiraOk = integrations.jira?.configured;
  const githubOk = integrations.github?.configured;
  const pineconeOk = integrations.pinecone?.configured;

  return (
    <footer className="ide-status-bar">
      <span className="ide-status-item">AI Support IDE</span>
      <button
        type="button"
        className="ide-status-item"
        style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}
        onClick={() => setBottomTab("problems")}
      >
        {warnCount > 0 ? `${warnCount} problem${warnCount > 1 ? "s" : ""}` : "No problems"}
      </button>
      <span className="ide-status-item">Jira: {jiraOk ? "live" : "mock"}</span>
      <span className="ide-status-item">GitHub: {githubOk ? "live" : "mock"}</span>
      <span className="ide-status-item">RAG: {pineconeOk ? "Pinecone" : "local"}</span>
      {state.investigationSessionId && (
        <span className="ide-status-item">Session: {state.investigationSessionId.slice(0, 8)}…</span>
      )}
    </footer>
  );
}
