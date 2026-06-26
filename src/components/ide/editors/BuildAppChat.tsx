"use client";

import { useEffect, useRef, useState } from "react";

export interface BuildAppChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  at?: string;
}

export function BuildAppChat({
  messages,
  onSend,
  disabled,
  loading,
  quickReplies,
  placeholder,
}: {
  messages: BuildAppChatMessage[];
  onSend: (msg: string) => void;
  disabled?: boolean;
  loading?: boolean;
  quickReplies?: string[];
  placeholder?: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function submit() {
    const val = input.trim();
    if (!val || disabled || loading) return;
    onSend(val);
    setInput("");
  }

  return (
    <div data-testid="build-app-chat" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 360 }}>
      <div
        data-testid="build-app-chat-messages"
        style={{
          flex: 1,
          overflow: "auto",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 12,
          background: "var(--surface-2)",
          marginBottom: 10,
        }}
      >
        {messages.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 14, margin: 0, lineHeight: 1.6 }}>
            Tell me what kind of app you need — for example: &quot;Build a page where my team can search for bad IP
            addresses and see details.&quot; I&apos;ll ask a few quick questions if anything is unclear, then create the
            app for you to review.
          </p>
        ) : (
          messages.map((m, i) => (
            <div
              key={`${m.at ?? i}-${m.role}`}
              style={{
                marginBottom: 14,
                padding: m.role === "user" ? "10px 12px" : "0 4px",
                background: m.role === "user" ? "var(--surface)" : "transparent",
                borderRadius: 8,
                border: m.role === "user" ? "1px solid var(--border)" : "none",
              }}
            >
              <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", marginBottom: 4 }}>
                {m.role === "user" ? "You" : m.role === "assistant" ? "App builder" : "Note"}
              </div>
              <div
                style={{ fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap" }}
                data-testid={m.role === "assistant" ? "build-app-chat-assistant" : undefined}
              >
                {m.content}
              </div>
            </div>
          ))
        )}
        {loading && (
          <p data-testid="build-app-chat-loading" style={{ color: "var(--muted)", fontSize: 13, margin: "8px 0" }}>
            Working on that…
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {quickReplies && quickReplies.length > 0 && !loading && (
        <div data-testid="build-app-quick-replies" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {quickReplies.map((q) => (
            <button
              key={q}
              type="button"
              disabled={disabled || loading}
              onClick={() => onSend(q)}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 16,
                padding: "6px 12px",
                fontSize: 12,
                color: "var(--text)",
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea
          data-testid="build-app-chat-input"
          disabled={disabled || loading}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder ?? "Describe your app or answer a question…"}
          rows={2}
          style={{
            flex: 1,
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "10px 12px",
            color: "var(--text)",
            fontSize: 14,
            fontFamily: "inherit",
            resize: "vertical",
            minHeight: 44,
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button
          type="button"
          data-testid="build-app-chat-send"
          disabled={disabled || loading || !input.trim()}
          onClick={submit}
          style={{
            background: "var(--accent)",
            border: "none",
            borderRadius: 8,
            color: "#fff",
            padding: "10px 16px",
            cursor: disabled || loading ? "not-allowed" : "pointer",
            fontSize: 13,
            whiteSpace: "nowrap",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
