"use client";

import { useWorkspace } from "../WorkspaceProvider";

export function WelcomeEditor() {
  const { runCommand } = useWorkspace();
  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>AI Support Investigation IDE</h1>
      <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
        Cursor-style workspace for API support debugging — chat, code, Jira, logs, Cyware APIs, CQL, and multi-agent
        investigation. All existing agent and import capabilities are preserved.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 20 }}>
        <ActionBtn onClick={() => runCommand("investigate")}>Start investigation</ActionBtn>
        <ActionBtn onClick={() => runCommand("diagnose")}>Quick diagnose</ActionBtn>
        <ActionBtn onClick={() => runCommand("import-api")}>Import API</ActionBtn>
        <ActionBtn onClick={() => runCommand("api-registry")}>API Registry</ActionBtn>
        <ActionBtn onClick={() => runCommand("cql")}>CQL workspace</ActionBtn>
        <ActionBtn onClick={() => runCommand("mcp")}>MCP status</ActionBtn>
      </div>
      <p style={{ marginTop: 24, fontSize: 12, color: "var(--muted)" }}>
        Tip: <kbd>Ctrl+Shift+P</kbd> command palette · <kbd>Ctrl+B</kbd> toggle sidebar · <kbd>Ctrl+J</kbd> bottom panel
      </p>
    </div>
  );
}

function ActionBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: "8px 14px",
        color: "var(--text)",
        cursor: "pointer",
        fontSize: 13,
      }}
    >
      {children}
    </button>
  );
}
