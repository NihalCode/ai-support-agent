"use client";

import { useEffect, useState } from "react";
import type { InvestigateResponse, SupportQuery, InvestigationChatMessage } from "@/lib/support/investigation/types";
import { Card, Button, Spinner, Badge } from "../ui";
import { FinalReportView } from "./FinalReportView";
import { EvidencePanel } from "./EvidencePanel";
import { InvestigationChat } from "./InvestigationChat";

const SIMPLE_MODE_KEY = "ai-support-investigation-simple-mode";

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
  padding: "8px 10px",
  color: "var(--text)",
  fontSize: 13,
  fontFamily: "inherit",
};

function applyExtractedFields(
  data: InvestigateResponse,
  setters: {
    setIssueRef: (v: string) => void;
    setEndpoint: (v: string) => void;
    setTimestamp: (v: string) => void;
    setRequestId: (v: string) => void;
    setStatusCode: (v: string) => void;
    setErrorMessage: (v: string) => void;
  }
) {
  const q = data.context?.query;
  if (!q) return;
  if (q.issueRef) setters.setIssueRef(q.issueRef);
  if (q.endpoint) setters.setEndpoint(q.endpoint);
  if (q.timestamp || q.approximateStartTime) setters.setTimestamp(q.timestamp ?? q.approximateStartTime ?? "");
  if (q.requestId) setters.setRequestId(q.requestId);
  if (q.statusCode) setters.setStatusCode(String(q.statusCode));
  if (q.errorMessage) setters.setErrorMessage(q.errorMessage);
}

export function InvestigationWorkspace({
  onResult,
  embedded = false,
}: {
  onResult?: (r: InvestigateResponse) => void;
  embedded?: boolean;
} = {}) {
  const [simpleMode, setSimpleMode] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [text, setText] = useState("");
  const [issueRef, setIssueRef] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [timestamp, setTimestamp] = useState("");
  const [requestId, setRequestId] = useState("");
  const [statusCode, setStatusCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [extractedPreview, setExtractedPreview] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InvestigateResponse | null>(null);
  const [chat, setChat] = useState<InvestigationChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(SIMPLE_MODE_KEY);
    if (stored === "false") {
      setSimpleMode(false);
      setAdvancedOpen(true);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(SIMPLE_MODE_KEY, simpleMode ? "true" : "false");
  }, [simpleMode]);

  useEffect(() => {
    fetch("/api/support/status")
      .then((r) => r.json())
      .then((s) => {
        const repo = s?.integrations?.github?.defaultRepo;
        if (repo && !repoUrl) setRepoUrl(repo);
      })
      .catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- prefill once

  function buildQuery(): SupportQuery {
    return {
      text,
      issueRef: issueRef || undefined,
      endpoint: endpoint || undefined,
      timestamp: timestamp || undefined,
      requestId: requestId || undefined,
      statusCode: statusCode ? Number(statusCode) : undefined,
      errorMessage: errorMessage || undefined,
      repoUrl: repoUrl || undefined,
    };
  }

  function previewExtraction() {
    const lines: string[] = [];
    const ticket = text.match(/\b([A-Z][A-Z0-9]+-\d+)\b/)?.[1];
    const workflow = text.match(/\b([\w\s-]{4,60})\s+workflow\b/i)?.[1]?.trim();
    const time = text.match(/\b(yesterday(?:\s+\w+)?|this morning|last night)\b/i)?.[0];
    const symptom = text.match(/\b(hangs?|fail(?:s|ed)?|stops?|timeout)[^.?\n]{0,60}/i)?.[0];
    if (ticket) lines.push(`Support ticket: ${ticket}`);
    if (workflow) lines.push(`Workflow: ${workflow}`);
    if (time) lines.push(`Timing: ${time}`);
    if (symptom) lines.push(`Symptom: ${symptom.trim()}`);
    setExtractedPreview(lines);
    if (ticket && !issueRef) setIssueRef(ticket);
  }

  async function investigate() {
    if (!text.trim() && !issueRef.trim()) {
      setError("Describe the problem in your own words, or mention a ticket ID.");
      return;
    }
    setLoading(true);
    setError(null);
    setChat([]);
    try {
      const res = await fetch("/api/support/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: buildQuery() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Investigation failed");
      setResult(data as InvestigateResponse);
      applyExtractedFields(data as InvestigateResponse, {
        setIssueRef,
        setEndpoint,
        setTimestamp,
        setRequestId,
        setStatusCode,
        setErrorMessage,
      });
      onResult?.(data as InvestigateResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Investigation failed");
    } finally {
      setLoading(false);
    }
  }

  async function sendChat(message: string) {
    if (!result?.sessionId) return;
    setChatLoading(true);
    const userMsg: InvestigationChatMessage = {
      role: "user",
      content: message,
      at: new Date().toISOString(),
    };
    setChat((c) => [...c, userMsg]);
    try {
      const res = await fetch("/api/support/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: result.sessionId, message }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error ?? "Chat failed";
        if (res.status === 404 && /session/i.test(msg)) {
          throw new Error("Session expired — describe the issue again to start a new investigation.");
        }
        throw new Error(msg);
      }
      setChat((c) => [
        ...c,
        {
          role: "assistant",
          content: data.chatReply,
          citations: data.citations,
          at: new Date().toISOString(),
        },
      ]);
    } catch (e) {
      setChat((c) => [
        ...c,
        {
          role: "assistant",
          content: e instanceof Error ? e.message : "Chat failed",
          at: new Date().toISOString(),
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: embedded
          ? "minmax(240px, 280px) minmax(0, 1fr)"
          : "minmax(260px, 320px) minmax(0, 1fr) minmax(280px, 360px)",
        gap: 12,
        alignItems: "start",
        minHeight: 520,
      }}
    >
      <div style={{ display: "grid", gap: 12 }}>
        <Card title="Support issue">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Mode</span>
            <button
              type="button"
              data-testid="investigation-mode-toggle"
              onClick={() => {
                setSimpleMode((s) => !s);
                if (simpleMode) setAdvancedOpen(true);
              }}
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "4px 8px",
                fontSize: 11,
                cursor: "pointer",
                color: "var(--text)",
              }}
            >
              {simpleMode ? "Simple mode" : "Technical mode"}
            </button>
          </div>

          <label style={labelStyle}>Describe the problem in your own words</label>
          <textarea
            data-testid="investigation-issue-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={previewExtraction}
            rows={simpleMode ? 6 : 4}
            placeholder="The workflow that blocks malicious IPs started hanging yesterday morning. Ticket AISUPS-1…"
            style={{ ...inputStyle, resize: "vertical" }}
          />

          {extractedPreview.length > 0 && simpleMode && (
            <div
              data-testid="investigation-extracted-preview"
              style={{
                marginTop: 10,
                padding: 10,
                background: "var(--surface-2)",
                borderRadius: 8,
                fontSize: 12,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Optional details we found</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {extractedPreview.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            data-testid="investigation-advanced-toggle"
            onClick={() => setAdvancedOpen((o) => !o)}
            style={{
              marginTop: 10,
              background: "none",
              border: "none",
              color: "var(--accent)",
              cursor: "pointer",
              fontSize: 12,
              padding: 0,
            }}
          >
            {advancedOpen ? "Hide advanced details" : "Advanced details (optional)"}
          </button>

          {advancedOpen && (
            <div data-testid="investigation-advanced-fields" style={{ marginTop: 10 }}>
              <label style={labelStyle}>Issue ref (optional)</label>
              <input
                value={issueRef}
                onChange={(e) => setIssueRef(e.target.value)}
                placeholder="AISUP5-2 or gh#1024"
                style={inputStyle}
              />
              <label style={{ ...labelStyle, marginTop: 10 }}>Endpoint, if you know it</label>
              <input
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="/v3/indicators/search/"
                style={inputStyle}
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                <div>
                  <label style={labelStyle}>Timestamp</label>
                  <input
                    value={timestamp}
                    onChange={(e) => setTimestamp(e.target.value)}
                    placeholder="2026-06-21 10:30"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Status code</label>
                  <input
                    value={statusCode}
                    onChange={(e) => setStatusCode(e.target.value)}
                    placeholder="500"
                    style={inputStyle}
                  />
                </div>
              </div>
              <label style={{ ...labelStyle, marginTop: 10 }}>Request or trace ID, if someone gave you one</label>
              <input value={requestId} onChange={(e) => setRequestId(e.target.value)} style={inputStyle} />
              <label style={{ ...labelStyle, marginTop: 10 }}>Error message</label>
              <input value={errorMessage} onChange={(e) => setErrorMessage(e.target.value)} style={inputStyle} />
              <label style={{ ...labelStyle, marginTop: 10 }}>GitHub repo (optional)</label>
              <input
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="NihalCode/ai-support-agent"
                style={inputStyle}
              />
            </div>
          )}

          <div style={{ marginTop: 12, width: "100%" }}>
            <Button variant="primary" data-testid="investigation-start-button" onClick={investigate} disabled={loading}>
              {loading ? "Investigating…" : simpleMode ? "Start from this description" : "Investigate"}
            </Button>
          </div>
          {loading && <Spinner label="Running agents…" />}
          {error && <p style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>{error}</p>}
          {simpleMode && (
            <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
              You can also paste this into chat — investigation starts automatically.
            </p>
          )}
        </Card>
        {result?.context.modes && (
          <Card title="Integration modes">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {Object.entries(result.context.modes).map(([k, v]) => (
                <Badge key={k} label={`${k}: ${v}`} />
              ))}
            </div>
          </Card>
        )}
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <InvestigationChat
          messages={chat}
          onSend={sendChat}
          disabled={!result?.sessionId || chatLoading}
          loading={chatLoading}
        />
        {result?.needsMoreInfo && (
          <Card title="A few things that would help">
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
              {result.missingQuestions.map((q) => (
                <li key={q.id}>{q.question}</li>
              ))}
            </ul>
          </Card>
        )}
        {result?.report && (
          <FinalReportView
            report={result.report}
            sessionId={result.sessionId}
            onReportUpdate={(report, fixProposal) =>
              setResult((r) =>
                r
                  ? {
                      ...r,
                      report,
                      context: fixProposal ? { ...r.context, fixProposal, report } : { ...r.context, report },
                    }
                  : r
              )
            }
          />
        )}
      </div>

      {!embedded && <EvidencePanel context={result?.context ?? null} />}
    </div>
  );
}
