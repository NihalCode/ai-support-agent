"use client";

import { Button } from "./ui";

/** Confirmation modal shown before ANY external write (e.g. posting a comment). */
export function ConfirmModal({
  open,
  title,
  target,
  body,
  onConfirm,
  onCancel,
  busy,
}: {
  open: boolean;
  title: string;
  target: string;
  body: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 16,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          maxWidth: 560,
          width: "100%",
          padding: 20,
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: 18 }}>{title}</h2>
        <p style={{ color: "var(--muted)", fontSize: 14 }}>
          This will write to <strong style={{ color: "var(--text)" }}>{target}</strong>. The agent
          performs no external writes without your explicit approval.
        </p>
        <pre
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 12,
            fontSize: 12,
            maxHeight: 220,
            overflow: "auto",
            whiteSpace: "pre-wrap",
          }}
        >
          {body}
        </pre>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={busy}>
            {busy ? "Posting…" : "Confirm & post"}
          </Button>
        </div>
      </div>
    </div>
  );
}
