"use client";

import { useState } from "react";

export function Card({
  title,
  children,
  right,
}: {
  title?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 16,
      }}
    >
      {title && (
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 14, letterSpacing: 0.3, color: "var(--muted)", textTransform: "uppercase" }}>
            {title}
          </h3>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Button({
  children,
  onClick,
  variant = "default",
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "danger" | "ghost";
  disabled?: boolean;
  title?: string;
}) {
  const bg =
    variant === "primary"
      ? "var(--accent)"
      : variant === "danger"
      ? "var(--red)"
      : variant === "ghost"
      ? "transparent"
      : "var(--surface-2)";
  const color = variant === "primary" || variant === "danger" ? "#fff" : "var(--text)";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: bg,
        color,
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "7px 12px",
        fontSize: 13,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

const BADGE_COLORS: Record<string, string> = {
  High: "var(--green)",
  Medium: "var(--amber)",
  Low: "var(--red)",
  "client-can-fix": "var(--green)",
  "support-can-fix": "var(--accent)",
  "engineering-required": "var(--red)",
  "not-enough-info": "var(--muted)",
  "not-doable": "var(--amber)",
};

export function Badge({ label }: { label: string }) {
  const color = BADGE_COLORS[label] ?? "var(--accent-2)";
  return (
    <span
      style={{
        background: "color-mix(in srgb, " + color + " 18%, transparent)",
        color,
        border: "1px solid " + color,
        borderRadius: 999,
        padding: "2px 10px",
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      {copied ? "Copied ✓" : label}
    </Button>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span style={{ color: "var(--muted)", fontSize: 13 }}>
      <span
        style={{
          display: "inline-block",
          width: 12,
          height: 12,
          border: "2px solid var(--border)",
          borderTopColor: "var(--accent)",
          borderRadius: "50%",
          marginRight: 8,
          animation: "spin 0.8s linear infinite",
          verticalAlign: "middle",
        }}
      />
      {label}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </span>
  );
}
