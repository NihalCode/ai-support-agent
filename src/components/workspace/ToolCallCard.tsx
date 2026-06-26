"use client";

import { useState } from "react";

interface Props {
  agent: string;
  summary: string;
  durationMs?: number;
  mock?: boolean;
  warnings?: string[];
  defaultOpen?: boolean;
}

/** Expandable card showing a specialist agent's tool call result. */
export function ToolCallCard({ agent, summary, durationMs, mock, warnings, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        marginBottom: 8,
        background: "var(--surface)",
        fontSize: 13,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          background: "transparent",
          border: "none",
          color: "var(--text)",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 11, color: "var(--muted)" }}>{open ? "▼" : "▶"}</span>
        <strong style={{ textTransform: "capitalize" }}>{agent}</strong>
        {mock && (
          <span style={{ fontSize: 10, color: "var(--muted)", border: "1px solid var(--border)", padding: "1px 5px", borderRadius: 4 }}>
            mock
          </span>
        )}
        {durationMs !== undefined && (
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)" }}>{durationMs}ms</span>
        )}
      </button>
      {open && (
        <div style={{ padding: "0 12px 10px", color: "var(--muted)", lineHeight: 1.5 }}>
          <p style={{ margin: "0 0 6px", color: "var(--text)" }}>{summary}</p>
          {warnings?.map((w) => (
            <p key={w} style={{ margin: "4px 0", fontSize: 12, color: "var(--yellow, #b8860b)" }}>
              ⚠ {w}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
