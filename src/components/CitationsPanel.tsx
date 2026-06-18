"use client";

import type { AnalysisCitation, RetrievedChunk } from "@/lib/support/types";
import { Card, Badge } from "./ui";

export function CitationsPanel({ citations }: { citations: AnalysisCitation[] }) {
  return (
    <Card title="K · Sources / citations">
      {citations.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: 13 }}>No sources cited.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {citations.map((c, i) => (
            <li
              key={i}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 13,
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                alignItems: "center",
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.url ? (
                  <a href={c.url} target="_blank" rel="noreferrer">
                    {c.label}
                  </a>
                ) : (
                  c.label
                )}
              </span>
              <Badge label={c.sourceType} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ContextPanel({ chunks }: { chunks: RetrievedChunk[] }) {
  return (
    <Card title="Retrieved context (RAG)">
      {chunks.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          No context retrieved — ingest the repo first.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 10, maxHeight: 460, overflow: "auto" }}>
          {chunks.map((c) => (
            <details key={c.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}>
              <summary style={{ cursor: "pointer", fontSize: 13, display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.metadata.filePath}
                  {c.metadata.lineStart ? `:${c.metadata.lineStart}-${c.metadata.lineEnd}` : ""}
                  {c.metadata.symbol ? ` · ${c.metadata.symbol}` : ""}
                </span>
                <span style={{ display: "flex", gap: 6 }}>
                  <Badge label={c.metadata.sourceType} />
                  <span style={{ color: "var(--muted)" }}>{c.score.toFixed(2)}</span>
                </span>
              </summary>
              <pre
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  whiteSpace: "pre-wrap",
                  color: "var(--muted)",
                  maxHeight: 200,
                  overflow: "auto",
                }}
              >
                {c.text}
              </pre>
            </details>
          ))}
        </div>
      )}
    </Card>
  );
}
