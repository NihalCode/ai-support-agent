"use client";

import { useState } from "react";
import { Card, Button, Badge, Spinner } from "./ui";

interface TestResult {
  id: string;
  name: string;
  description: string;
  pass: boolean;
  reasons: string[];
  analysis: { category: string; fixability: string; confidence: string };
}

export function TestMode() {
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<{ total: number; passed: number; results: TestResult[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAll() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/support/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Test run failed");
      setSummary(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test run failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card
      title="Test mode — 8 example cases"
      right={
        <Button onClick={runAll} disabled={running} variant="primary">
          {running ? "Running…" : "Run all tests"}
        </Button>
      }
    >
      {running && <Spinner label="Ingesting mock repo + analyzing 8 cases…" />}
      {error && <p style={{ color: "var(--red)", fontSize: 13 }}>{error}</p>}
      {summary && (
        <>
          <div style={{ marginBottom: 12, fontSize: 14 }}>
            <strong>{summary.passed}</strong> / {summary.total} passed
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {summary.results.map((r) => (
              <details key={r.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}>
                <summary style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                  <span>{r.name}</span>
                  <Badge label={r.pass ? "PASS" : "review"} />
                </summary>
                <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>
                  <p style={{ margin: "0 0 6px" }}>&ldquo;{r.description}&rdquo;</p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Badge label={r.analysis.category} />
                    <Badge label={r.analysis.fixability} />
                    <Badge label={r.analysis.confidence} />
                  </div>
                  {r.reasons.length > 0 && (
                    <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                      {r.reasons.map((reason, i) => (
                        <li key={i}>{reason}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
