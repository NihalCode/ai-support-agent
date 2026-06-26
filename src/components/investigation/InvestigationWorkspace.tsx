"use client";

import { useEffect, useState } from "react";
import type { InvestigateResponse, SupportQuery, InvestigationChatMessage } from "@/lib/support/investigation/types";
import { Card, Button, Spinner, Badge } from "../ui";
import { FinalReportView } from "./FinalReportView";
import { EvidencePanel } from "./EvidencePanel";
import { InvestigationChat } from "./InvestigationChat";

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

export function InvestigationWorkspace({
  onResult,
  embedded = false,
}: {
  onResult?: (r: InvestigateResponse) => void;
  embedded?: boolean;
} = {}) {
  const [text, setText] = useState("");
  const [issueRef, setIssueRef] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [timestamp, setTimestamp] = useState("");
  const [requestId, setRequestId] = useState("");
  const [statusCode, setStatusCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [repoUrl, setRepoUrl] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InvestigateResponse | null>(null);
  const [chat, setChat] = useState<InvestigationChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

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

  async function investigate() {
    if (!text.trim() && !issueRef.trim()) {
      setError("Enter a support query or Jira/GitHub issue ref.");
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
          throw new Error("Session expired — click Investigate again, then retry your question.");
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
      {/* Left — query intake */}
      <div style={{ display: "grid", gap: 12 }}>
        <Card title="Support query">
          <label style={labelStyle}>Customer / support description</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder="The customer says the indicator search API is failing with 500s since 10:30 AM…"
            style={{ ...inputStyle, resize: "vertical" }}
          />
          <label style={{ ...labelStyle, marginTop: 10 }}>Issue ref (optional)</label>
          <input
            value={issueRef}
            onChange={(e) => setIssueRef(e.target.value)}
            placeholder="AISUP5-2 or gh#1024"
            style={inputStyle}
          />
          <label style={{ ...labelStyle, marginTop: 10 }}>Endpoint</label>
          <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="/v3/indicators/search/" style={inputStyle} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
            <div>
              <label style={labelStyle}>Timestamp</label>
              <input value={timestamp} onChange={(e) => setTimestamp(e.target.value)} placeholder="2026-06-21 10:30" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Status code</label>
              <input value={statusCode} onChange={(e) => setStatusCode(e.target.value)} placeholder="500" style={inputStyle} />
            </div>
          </div>
          <label style={{ ...labelStyle, marginTop: 10 }}>Request / trace ID</label>
          <input value={requestId} onChange={(e) => setRequestId(e.target.value)} style={inputStyle} />
          <label style={{ ...labelStyle, marginTop: 10 }}>Error message</label>
          <input value={errorMessage} onChange={(e) => setErrorMessage(e.target.value)} style={inputStyle} />
          <label style={{ ...labelStyle, marginTop: 10 }}>GitHub repo (optional)</label>
          <input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="NihalCode/ai-support-agent" style={inputStyle} />
          <div style={{ marginTop: 12, width: "100%" }}>
            <Button variant="primary" onClick={investigate} disabled={loading}>
              {loading ? "Investigating…" : "Investigate"}
            </Button>
          </div>
          {loading && <Spinner label="Running agents…" />}
          {error && <p style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>{error}</p>}
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

      {/* Center — chat + report */}
      <div style={{ display: "grid", gap: 12 }}>
        <InvestigationChat
          messages={chat}
          onSend={sendChat}
          disabled={!result?.sessionId || chatLoading}
          loading={chatLoading}
        />
        {result?.needsMoreInfo && (
          <Card title="Missing information">
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

      {/* Right — evidence (hidden when embedded in combined workspace) */}
      {!embedded && <EvidencePanel context={result?.context ?? null} />}
    </div>
  );
}
