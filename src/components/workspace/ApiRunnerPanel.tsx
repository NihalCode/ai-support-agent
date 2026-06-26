"use client";

import { useState } from "react";
import { Button, Card } from "../ui";

interface Props {
  developerMode?: boolean;
  initialMethod?: string;
  initialPath?: string;
}

/** Developer-only API runner — preview/execute imported endpoints. */
export function ApiRunnerPanel({ developerMode = false, initialMethod, initialPath }: Props) {
  const [method, setMethod] = useState(initialMethod ?? "GET");
  const [path, setPath] = useState(initialPath ?? "/ping/");
  const [body, setBody] = useState("{}");
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!developerMode) return;
    setLoading(true);
    setResponse(null);
    try {
      const res = await fetch("/api/support/api-execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          path,
          body: method !== "GET" ? JSON.parse(body || "{}") : undefined,
          preview: false,
        }),
      });
      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (e) {
      setResponse(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card title="API runner">
      {!developerMode && (
        <p style={{ fontSize: 13, color: "var(--muted)" }}>
          Configure Cyware/CTIX credentials in Integrations to enable live API calls. Docs-only mode still
          works for investigation.
        </p>
      )}
      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            style={inputStyle}
            disabled={!developerMode}
          >
            {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/v3/tags/bulk/"
            style={{ ...inputStyle, flex: 1 }}
            disabled={!developerMode}
          />
        </div>
        {method !== "GET" && (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12 }}
            disabled={!developerMode}
          />
        )}
        <Button onClick={send} disabled={!developerMode || loading}>
          {loading ? "Sending…" : "Send request"}
        </Button>
        {response && (
          <pre
            style={{
              background: "var(--surface-2)",
              padding: 10,
              borderRadius: 8,
              fontSize: 11,
              overflow: "auto",
              maxHeight: 200,
            }}
          >
            {response}
          </pre>
        )}
      </div>
    </Card>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 10px",
  color: "var(--text)",
  fontSize: 13,
};
