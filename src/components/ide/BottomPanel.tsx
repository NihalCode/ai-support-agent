"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "./WorkspaceProvider";

export function BottomPanel({ hideTabs = false }: { hideTabs?: boolean }) {
  const { state } = useWorkspace();
  const [mcpStatus, setMcpStatus] = useState<string>("");
  const [output, setOutput] = useState<string>("Run npm test, npm run mcp:check, or investigate from the editor.");

  useEffect(() => {
    if (state.bottomTab === "mcp") {
      fetch("/api/support/mcp")
        .then((r) => r.json())
        .then((d) => setMcpStatus(JSON.stringify(d.statuses ?? d, null, 2)))
        .catch((e) => setMcpStatus(String(e)));
    }
    if (state.bottomTab === "imports") {
      fetch("/api/support/api-import")
        .then((r) => r.json())
        .then((d) => setOutput(JSON.stringify(d, null, 2)))
        .catch(() => undefined);
    }
  }, [state.bottomTab]);

  const content = (
    <>
      {state.bottomTab === "problems" && (
        <div data-testid="problems-panel">
          {state.problems.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>No problems detected.</p>
          ) : (
            state.problems.map((p) => (
              <div key={p.id} className={`ide-problem ${p.severity}`}>
                [{p.severity}] {p.message}
              </div>
            ))
          )}
        </div>
      )}
      {state.bottomTab === "output" && <pre>{output}</pre>}
      {state.bottomTab === "logs" && (
        <p style={{ color: "var(--muted)" }}>
          Use the Logs sidebar or investigation workspace to search logs. Credentials required for live logs.
        </p>
      )}
      {state.bottomTab === "tests" && <pre>npm test — run in project root</pre>}
      {state.bottomTab === "mcp" && <pre data-testid="mcp-status">{mcpStatus || "Loading MCP status…"}</pre>}
      {state.bottomTab === "imports" && <pre>{output}</pre>}
      {state.bottomTab === "trace" && (
        <p style={{ color: "var(--muted)" }}>
          Agent trace summaries appear in tool cards and chat. No hidden chain-of-thought is shown.
        </p>
      )}
    </>
  );

  if (hideTabs) return content;

  return content;
}
