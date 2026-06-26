"use client";

import { useState } from "react";

export function LogsSidebar() {
  const [requestId, setRequestId] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [note, setNote] = useState("");

  return (
    <div style={{ padding: 8 }}>
      <p style={{ fontSize: 11, color: "var(--muted)", padding: "0 4px 8px" }}>
        Log search runs during investigation via the Logs Agent. Configure VERCEL_* or MCP logs server for live data.
      </p>
      <input
        className="ide-chat-input"
        placeholder="Request ID"
        value={requestId}
        onChange={(e) => setRequestId(e.target.value)}
        style={{ width: "100%", marginBottom: 6 }}
      />
      <input
        className="ide-chat-input"
        placeholder="Endpoint"
        value={endpoint}
        onChange={(e) => setEndpoint(e.target.value)}
        style={{ width: "100%", marginBottom: 8 }}
      />
      <button
        type="button"
        className="ide-tree-item"
        onClick={() =>
          setNote(
            requestId || endpoint
              ? `Use Investigation with requestId=${requestId || "—"} endpoint=${endpoint || "—"} to search logs.`
              : "Add filters or start an investigation."
          )
        }
      >
        Prepare log search
      </button>
      {note && <p style={{ padding: 8, fontSize: 12, color: "var(--muted)" }}>{note}</p>}
    </div>
  );
}
