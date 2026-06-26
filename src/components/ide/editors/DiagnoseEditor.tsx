"use client";

import { useState } from "react";
import type { AnalyzeResult } from "@/lib/support/types";
import { DiagnosisView } from "../../DiagnosisView";
import { Button, Spinner } from "../../ui";

export function DiagnoseEditor() {
  const [description, setDescription] = useState("");
  const [issueRef, setIssueRef] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/support/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, issueRef: issueRef || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setResult(data as AnalyzeResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <textarea
        className="ide-code-block"
        rows={4}
        placeholder="Describe the client issue…"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        style={{ width: "100%", marginBottom: 8 }}
      />
      <input
        className="ide-chat-input"
        placeholder="Issue ref (optional)"
        value={issueRef}
        onChange={(e) => setIssueRef(e.target.value)}
        style={{ width: "100%", marginBottom: 8 }}
      />
      <Button variant="primary" onClick={analyze} disabled={loading}>
        Analyze
      </Button>
      {loading && <Spinner />}
      {error && <p style={{ color: "var(--red)" }}>{error}</p>}
      {result && <DiagnosisView analysis={result.analysis} />}
    </div>
  );
}
