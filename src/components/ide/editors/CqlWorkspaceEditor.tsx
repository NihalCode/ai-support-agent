"use client";

import { useState } from "react";

export function CqlWorkspaceEditor() {
  const [query, setQuery] = useState("");
  const [nl, setNl] = useState("malicious IPs from last 7 days");
  const [output, setOutput] = useState("");

  async function generate() {
    const res = await fetch("/api/support/cql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate", query: nl }),
    });
    const data = await res.json();
    setOutput(JSON.stringify(data, null, 2));
    if (data.cql) setQuery(data.cql);
  }

  async function validate() {
    const res = await fetch("/api/support/cql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "validate", query }),
    });
    setOutput(JSON.stringify(await res.json(), null, 2));
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>CQL Workspace</h2>
      <label style={{ fontSize: 11, color: "var(--muted)" }}>Natural language</label>
      <input className="ide-chat-input" value={nl} onChange={(e) => setNl(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
      <button type="button" className="ide-tree-item" onClick={generate}>
        Generate CQL
      </button>
      <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginTop: 12 }}>CQL editor</label>
      <textarea className="ide-code-block" rows={6} value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: "100%" }} />
      <button type="button" className="ide-tree-item" onClick={validate}>
        Validate
      </button>
      {output && <pre className="ide-code-block" style={{ marginTop: 12 }}>{output}</pre>}
    </div>
  );
}
