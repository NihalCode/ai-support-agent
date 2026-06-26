"use client";

import { useEffect, useState } from "react";
import type { InvestigateResponse } from "@/lib/support/investigation/types";
import { InvestigationWorkspace } from "../investigation/InvestigationWorkspace";
import { DiagnosisView } from "../DiagnosisView";
import { CitationsPanel } from "../CitationsPanel";
import { ResponsesPanel, type DraftedComments } from "../ResponsesPanel";
import { IntegrationsPanel } from "../IntegrationsPanel";
import { TestMode } from "../TestMode";
import type { AnalyzeResult } from "@/lib/support/types";
import { Card, Button, Spinner } from "../ui";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { ToolCallCard } from "./ToolCallCard";
import { ApiRunnerPanel } from "./ApiRunnerPanel";
import { CredentialSetup } from "./CredentialSetup";

type Mode = "investigate" | "diagnose" | "integrations" | "settings";

/**
 * Unified diagnosis + investigation IDE — Cursor-like workspace with shared chat,
 * evidence sidebar, and specialist agent tool cards.
 */
export function CombinedWorkspace() {
  const [mode, setMode] = useState<Mode>("investigate");
  const [status, setStatus] = useState<{ readOnly: boolean; integrations: Record<string, { configured: boolean }> } | null>(null);
  const [investigation, setInvestigation] = useState<InvestigateResponse | null>(null);

  // Diagnose flow state (embedded when user switches or runs quick diagnose)
  const [repoUrl, setRepoUrl] = useState("");
  const [issueRef, setIssueRef] = useState("");
  const [description, setDescription] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [diagResult, setDiagResult] = useState<AnalyzeResult | null>(null);
  const [comments, setComments] = useState<DraftedComments | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/support/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
    fetch("/api/support/bootstrap", { method: "POST" }).catch(() => undefined);
  }, []);

  async function runDiagnose() {
    if (!description.trim() && !issueRef.trim()) {
      setError("Enter a problem description or issue reference.");
      return;
    }
    setAnalyzing(true);
    setError(null);
    setDiagResult(null);
    try {
      const res = await fetch("/api/support/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: repoUrl || undefined, issueRef: issueRef || undefined, description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setDiagResult(data as AnalyzeResult);
      const cRes = await fetch("/api/support/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis: (data as AnalyzeResult).analysis }),
      });
      if (cRes.ok) setComments(await cRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  const devMode = Boolean(
    status?.integrations?.ctix?.configured ||
      status?.integrations?.github?.configured ||
      status?.integrations?.jira?.configured
  );

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "16px 16px 60px" }}>
      <header style={{ marginBottom: 12 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>AI Support Investigation IDE</h1>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
          Diagnose issues, investigate incidents, search Cyware APIs/CQL, and act on Jira — one workspace.
        </p>
        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
          {(
            [
              ["investigate", "Investigate"],
              ["diagnose", "Quick diagnose"],
              ["integrations", "Integrations"],
              ["settings", "Credentials"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              style={{
                background: mode === id ? "var(--surface)" : "transparent",
                border: "1px solid var(--border)",
                borderBottom: mode === id ? "2px solid var(--accent)" : "1px solid var(--border)",
                borderRadius: "8px 8px 0 0",
                padding: "6px 14px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                color: mode === id ? "var(--text)" : "var(--muted)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {mode === "integrations" && <IntegrationsPanel />}
      {mode === "settings" && <CredentialSetup />}

      {mode === "investigate" && (
        <div style={{ display: "flex", gap: 0, alignItems: "stretch", minHeight: 520 }}>
          <WorkspaceSidebar activeSessionId={investigation?.sessionId} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <InvestigationWorkspace onResult={setInvestigation} embedded />
            {investigation?.supervisorReason && (
              <p style={{ fontSize: 12, color: "var(--muted)", padding: "8px 12px" }}>
                Supervisor: {investigation.supervisorReason}
              </p>
            )}
            {investigation?.credentialGaps && investigation.credentialGaps.length > 0 && (
              <div style={{ padding: "0 12px 8px" }}>
                {investigation.credentialGaps.slice(0, 2).map((g) => (
                  <p key={g} style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0" }}>
                    {g}
                  </p>
                ))}
              </div>
            )}
            {investigation?.context && (
              <div style={{ padding: "0 12px 12px" }}>
                <ToolCallCard agent="docs" summary={investigation.context.docs.summary} />
                <ToolCallCard agent="jira" summary={investigation.context.jira.summary} mock={investigation.context.jira.mock} />
                <ToolCallCard agent="code" summary={investigation.context.code.summary} mock={investigation.context.code.mock} />
                <ToolCallCard agent="logs" summary={investigation.context.logs.summary} mock={investigation.context.logs.mock} />
                {investigation.context.cql && (
                  <ToolCallCard agent="cql" summary={investigation.context.cql.summary} mock={investigation.context.cql.mock} />
                )}
                {investigation.context.version && (
                  <ToolCallCard agent="version" summary={investigation.context.version.summary} />
                )}
              </div>
            )}
            {investigation?.markdownReport && (
              <details style={{ margin: "0 12px 12px", fontSize: 13 }}>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>Export investigation report (Markdown)</summary>
                <pre
                  style={{
                    background: "var(--surface-2)",
                    padding: 12,
                    borderRadius: 8,
                    overflow: "auto",
                    maxHeight: 320,
                    fontSize: 11,
                    marginTop: 8,
                  }}
                >
                  {investigation.markdownReport}
                </pre>
              </details>
            )}
            <div style={{ padding: 12 }}>
              <ApiRunnerPanel developerMode={devMode} />
            </div>
          </div>
        </div>
      )}

      {mode === "diagnose" && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16 }}>
          <div style={{ display: "grid", gap: 12 }}>
            <Card title="Describe the issue">
              <input
                value={issueRef}
                onChange={(e) => setIssueRef(e.target.value)}
                placeholder="Jira/GitHub ref (optional)"
                style={inputStyle}
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is the client experiencing?"
                rows={4}
                style={{ ...inputStyle, marginTop: 8, resize: "vertical" }}
              />
              <Button variant="primary" onClick={runDiagnose} disabled={analyzing}>
                {analyzing ? "Analyzing…" : "Analyze"}
              </Button>
              <div style={{ marginTop: 10 }}>
                {analyzing && <Spinner />}
                {error && <p style={{ color: "var(--red)", fontSize: 13 }}>{error}</p>}
              </div>
            </Card>
            <TestMode />
          </div>
          <div>
            {diagResult && (
              <>
                <DiagnosisView analysis={diagResult.analysis} />
                {comments && (
                  <ResponsesPanel
                    comments={comments}
                    onPostCustomer={() => undefined}
                    canWrite={!status?.readOnly}
                    issueRef={issueRef}
                  />
                )}
                <CitationsPanel citations={diagResult.analysis.citations} />
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 10px",
  color: "var(--text)",
  fontSize: 13,
};
