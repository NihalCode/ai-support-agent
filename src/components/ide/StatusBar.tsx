"use client";

import { useEffect, useState } from "react";
import { productConfig } from "@/lib/product-config";
import { integrationLabel, problemsStatus } from "./client-copy";
import { useWorkspace } from "./WorkspaceProvider";

export function StatusBar() {
  const { state, setBottomTab, isClientMode, toggleBottom } = useWorkspace();
  const [integrations, setIntegrations] = useState<Record<string, { configured: boolean }>>({});

  useEffect(() => {
    fetch("/api/support/status")
      .then((r) => r.json())
      .then((s) => setIntegrations(s.integrations ?? {}))
      .catch(() => undefined);
  }, []);

  const warnCount = state.problems.length;
  const devMode = !isClientMode;

  if (isClientMode) {
    return (
      <footer className="ide-status-bar ide-status-bar--client" data-testid="status-bar">
        <span className="ide-status-item">{productConfig.appName}</span>
        <button
          type="button"
          className="ide-status-item ide-status-btn"
          onClick={() => {
            if (warnCount > 0) toggleBottom();
          }}
          data-testid="status-readiness"
        >
          {problemsStatus(warnCount, false)}
        </button>
        {state.investigationSessionId && (
          <span className="ide-status-item">Investigation in progress</span>
        )}
        {state.activeBuildProjectId && (
          <span className="ide-status-item">App project active</span>
        )}
      </footer>
    );
  }

  return (
    <footer className="ide-status-bar" data-testid="status-bar">
      <span className="ide-status-item">{productConfig.appName}</span>
      <button
        type="button"
        className="ide-status-item ide-status-btn"
        style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}
        onClick={() => setBottomTab("problems")}
      >
        {problemsStatus(warnCount, true)}
      </button>
      {integrationLabel("jira", Boolean(integrations.jira?.configured), devMode) && (
        <span className="ide-status-item">{integrationLabel("jira", Boolean(integrations.jira?.configured), devMode)}</span>
      )}
      {integrationLabel("github", Boolean(integrations.github?.configured), devMode) && (
        <span className="ide-status-item">{integrationLabel("github", Boolean(integrations.github?.configured), devMode)}</span>
      )}
      {integrationLabel("pinecone", Boolean(integrations.pinecone?.configured), devMode) && (
        <span className="ide-status-item">{integrationLabel("pinecone", Boolean(integrations.pinecone?.configured), devMode)}</span>
      )}
      {state.investigationSessionId && (
        <span className="ide-status-item">Session: {state.investigationSessionId.slice(0, 8)}…</span>
      )}
    </footer>
  );
}
