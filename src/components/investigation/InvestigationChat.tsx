"use client";

import { useState } from "react";
import type { InvestigationChatMessage } from "@/lib/support/investigation/types";
import { Card, Button, Spinner } from "../ui";

export function InvestigationChat({
  messages,
  onSend,
  disabled,
  loading,
}: {
  messages: InvestigationChatMessage[];
  onSend: (msg: string) => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const [input, setInput] = useState("");
  return (
    <Card title="Investigation chat">
      <div
        style={{
          minHeight: 200,
          maxHeight: 320,
          overflow: "auto",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 10,
          marginBottom: 10,
          background: "var(--surface-2)",
        }}
      >
        {messages.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>
            After investigating, ask follow-ups like: “Is this a known Jira issue?”, “Show the code path”, “What logs prove this?”, “Generate a patch”, “Create a Jira ticket”.
          </p>
        ) : (
          messages.map((m, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase" }}>{m.role}</div>
              <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.content}</div>
              {m.citations?.length ? (
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                  Sources: {m.citations.map((c) => c.label).join("; ")}
                </div>
              ) : null}
            </div>
          ))
        )}
        {loading && <Spinner label="Thinking…" />}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={disabled}
          placeholder={disabled ? "Run Investigate first" : "Ask a follow-up question…"}
          style={{
            flex: 1,
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "8px 10px",
            color: "var(--text)",
            fontSize: 14,
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && input.trim() && !disabled) {
              onSend(input.trim());
              setInput("");
            }
          }}
        />
        <Button
          disabled={disabled || !input.trim()}
          onClick={() => {
            onSend(input.trim());
            setInput("");
          }}
        >
          Ask
        </Button>
      </div>
    </Card>
  );
}
