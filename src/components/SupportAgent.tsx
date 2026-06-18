"use client";

import { useEffect, useState } from "react";
import type { AnalyzeResult, IssueAnalysis } from "@/lib/support/types";
import { Card, Button, Spinner, Badge } from "./ui";
import { DiagnosisView } from "./DiagnosisView";
import { CitationsPanel, ContextPanel } from "./CitationsPanel";
import { ResponsesPanel, type DraftedComments } from "./ResponsesPanel";
import { ConfirmModal } from "./ConfirmModal";
import { TestMode } from "./TestMode";
import { IntegrationsPanel } from "./IntegrationsPanel";

interface StatusInfo {
  readOnly: boolean;
  mode: { analysis: string; vectorStore: string; repo: string; tickets: string };
  integrations: Record<string, { configured: boolean }>;
}

export function SupportAgent() {
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [issueRef, setIssueRef] = useState("");
  const [description, setDescription] = useState("");

  const [ingesting, setIngesting] = useState(false);
  const [ingestMsg, setIngestMsg] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [comments, setComments] = useState<DraftedComments | null>(null);
  const [patchLoading, setPatchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postResult, setPostResult] = useState<string | null>(null);
  const [view, setView] = useState<"diagnose" | "integrations">("diagnose");

  useEffect(() => {
    fetch("/api/support/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  async function handleIngest() {
    setIngesting(true);
    setIngestMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/support/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: repoUrl || undefined, includeIssues: true, includePRs: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ingestion failed");
      const by = Object.entries(data.bySource as Record<string, number>)
        .map(([k, v]) => `${v} ${k}`)
        .join(", ");
      setIngestMsg(
        `Indexed ${data.repo}@${data.branch}: ${data.chunks} chunks (${by}) → ${data.upserted} upserted${
          data.usedMock.vectorStore ? " · in-memory store" : " · Pinecone"
        }${data.usedMock.repo ? " · demo data (no repo URL — add one or set GITHUB_TOKEN)" : data.usedMock.tickets ? "" : " · public GitHub"}`
      );
      if (data.warnings?.length) {
        setIngestMsg((m) => `${m ?? ""}\n⚠ ${(data.warnings as string[]).join("; ")}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ingestion failed");
    } finally {
      setIngesting(false);
    }
  }

  async function draftComments(analysis: IssueAnalysis) {
    try {
      const res = await fetch("/api/support/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis }),
      });
      const data = await res.json();
      if (res.ok) setComments(data as DraftedComments);
    } catch {
      /* non-fatal */
    }
  }

  async function handleAnalyze() {
    if (!description.trim() && !issueRef.trim()) {
      setError("Enter a problem description or an issue/ticket reference.");
      return;
    }
    setAnalyzing(true);
    setError(null);
    setResult(null);
    setComments(null);
    setPostResult(null);
    try {
      const res = await fetch("/api/support/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoUrl: repoUrl || undefined,
          issueRef: issueRef || undefined,
          description,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setResult(data as AnalyzeResult);
      await draftComments((data as AnalyzeResult).analysis);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleGeneratePatch() {
    if (!result) return;
    setPatchLoading(true);
    try {
      const res = await fetch("/api/support/patch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, analysis: result.analysis }),
      });
      const data = await res.json();
      if (res.ok && data.patch) {
        setResult({ ...result, analysis: { ...result.analysis, codeFix: data.patch } });
      }
    } finally {
      setPatchLoading(false);
    }
  }

  async function confirmPost() {
    if (!comments || !issueRef) return;
    setPosting(true);
    try {
      const res = await fetch("/api/support/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "comment",
          ref: issueRef,
          repoUrl: repoUrl || undefined,
          body: comments.customer,
          approved: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Write failed");
      setPostResult(
        data.mock
          ? `Mock comment created (no real GitHub/Jira credentials): ${data.url}`
          : `Comment posted: ${data.url}`
      );
    } catch (e) {
      setPostResult(`Failed: ${e instanceof Error ? e.message : "write error"}`);
    } finally {
      setPosting(false);
      setModalOpen(false);
    }
  }

  const canWrite = Boolean(status && !status.readOnly);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px 80px" }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, margin: 0 }}>AI Support Agent</h1>
        <p style={{ color: "var(--muted)", marginTop: 6, fontSize: 14, maxWidth: 760 }}>
          Describe a client&apos;s problem (optionally with a GitHub/Jira reference). The agent
          retrieves repo + ticket context, diagnoses the root cause, classifies who should fix it,
          and drafts customer + engineering responses — every claim cited.
        </p>
        {status && <StatusBar status={status} />}
        <div style={{ display: "flex", gap: 6, marginTop: 16 }}>
          {([["diagnose", "Diagnose issue"], ["integrations", "Integrations & tools"]] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setView(id)}
              style={{
                background: view === id ? "var(--surface)" : "transparent",
                color: view === id ? "var(--text)" : "var(--muted)",
                border: "1px solid var(--border)",
                borderBottom: view === id ? "2px solid var(--accent)" : "1px solid var(--border)",
                borderRadius: "8px 8px 0 0",
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {view === "integrations" && <IntegrationsPanel />}

      {view === "diagnose" && (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 16 }}>
          <Card title="1 · Connect a repository">
            <label style={labelStyle}>GitHub repo URL or owner/name</label>
            <input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="acme/checkout-service (blank = default/mock)"
              style={inputStyle}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
              <Button onClick={handleIngest} disabled={ingesting}>
                {ingesting ? "Ingesting…" : "Ingest repo into RAG index"}
              </Button>
              {ingesting && <Spinner />}
            </div>
            {ingestMsg && <p style={{ color: "var(--green)", fontSize: 13, marginTop: 8 }}>{ingestMsg}</p>}
          </Card>

          <Card title="2 · Describe the issue">
            <label style={labelStyle}>GitHub issue / Jira ticket reference (optional)</label>
            <input
              value={issueRef}
              onChange={(e) => setIssueRef(e.target.value)}
              placeholder="gh#1024 or PAY-101 — enough on its own"
              style={inputStyle}
            />
            <label style={{ ...labelStyle, marginTop: 12 }}>What is the client experiencing?</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Plain English is fine — e.g. 'it broke after the update'. Leave blank if you entered an issue number above."
              rows={5}
              style={{ ...inputStyle, resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
              <Button variant="primary" onClick={handleAnalyze} disabled={analyzing}>
                {analyzing ? "Analyzing…" : "Analyze issue"}
              </Button>
              {analyzing && <Spinner label="Retrieving context + diagnosing…" />}
            </div>
            {error && <p style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>{error}</p>}
          </Card>

          <TestMode />
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          {!result && !analyzing && (
            <Card title="Diagnosis">
              <p style={{ color: "var(--muted)", fontSize: 14 }}>
                Run an analysis to see the structured triage report (summary, root cause, confidence,
                evidence, fixability, fix steps, code patch, questions, suggested responses, and
                citations).
              </p>
            </Card>
          )}

          {result && (
            <>
              <DiagnosisView
                analysis={result.analysis}
                onGeneratePatch={handleGeneratePatch}
                patchLoading={patchLoading}
              />
              {comments && (
                <ResponsesPanel
                  comments={comments}
                  onPostCustomer={() => setModalOpen(true)}
                  canWrite={canWrite}
                  issueRef={issueRef}
                />
              )}
              {postResult && (
                <Card title="Write result">
                  <p style={{ fontSize: 13 }}>{postResult}</p>
                </Card>
              )}
              <CitationsPanel citations={result.analysis.citations} />
              <ContextPanel chunks={result.analysis.retrievedContext} />
            </>
          )}
        </div>
      </div>
      )}

      <ConfirmModal
        open={modalOpen}
        title="Post comment?"
        target={issueRef}
        body={comments?.customer ?? ""}
        onConfirm={confirmPost}
        onCancel={() => setModalOpen(false)}
        busy={posting}
      />
    </div>
  );
}

function StatusBar({ status }: { status: StatusInfo }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
      <Badge label={`analysis: ${status.mode.analysis}`} />
      <Badge label={`vectors: ${status.mode.vectorStore}`} />
      <Badge label={`repo: ${status.mode.repo}`} />
      <Badge label={`tickets: ${status.mode.tickets}`} />
      <Badge label={status.readOnly ? "read-only" : "writes: approval-gated"} />
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "var(--muted)",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "9px 11px",
  color: "var(--text)",
  fontSize: 14,
  fontFamily: "inherit",
};
