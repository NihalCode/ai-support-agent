"use client";

import type { ToolCallCardState } from "./types";

export function IdeToolCallCard({ card }: { card: ToolCallCardState }) {
  const statusClass =
    card.status === "success" ? "success" : card.status === "error" ? "error" : card.status === "running" ? "running" : "";

  return (
    <div className="ide-tool-card">
      <div className="ide-tool-card-header">
        <span className={`ide-badge ${statusClass}`}>{card.status}</span>
        <strong>{card.agent}</strong>
        <span style={{ color: "var(--muted)", flex: 1 }}>{card.action}</span>
        {card.durationMs !== undefined && <span style={{ fontSize: 10, color: "var(--muted)" }}>{card.durationMs}ms</span>}
      </div>
      <div style={{ padding: "0 10px 8px", fontSize: 12, color: "var(--text)" }}>{card.summary}</div>
      {card.details && (
        <pre className="ide-code-block" style={{ margin: "0 8px 8px", fontSize: 11 }}>
          {card.details}
        </pre>
      )}
    </div>
  );
}
