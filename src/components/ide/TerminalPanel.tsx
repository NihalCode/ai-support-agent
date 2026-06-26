"use client";

import { useEffect, useRef, useState } from "react";

interface CommandDef {
  id: string;
  command: string;
  label: string;
}

interface TerminalSession {
  id: string;
  command: string;
  status: string;
  exitCode?: number;
  output: { stream: string; text: string }[];
}

export function TerminalPanel() {
  const [commands, setCommands] = useState<CommandDef[]>([]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [running, setRunning] = useState<TerminalSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const outputRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    fetch("/api/support/terminal/commands")
      .then((r) => r.json())
      .then((d) => setCommands(d.commands ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    outputRef.current?.scrollTo(0, outputRef.current.scrollHeight);
  }, [sessions, running]);

  async function run(cmd?: string) {
    const command = (cmd ?? input).trim();
    if (!command) return;
    setError(null);
    setHistory((h) => [command, ...h.filter((x) => x !== command)].slice(0, 20));
    setInput("");

    const res = await fetch("/api/support/terminal/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Command blocked");
      return;
    }
    setRunning(data.status === "running" ? data : null);
    setSessions((s) => [data, ...s].slice(0, 10));
    if (data.status === "running") {
      pollSession(data.id);
    }
  }

  async function pollSession(id: string) {
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const res = await fetch(`/api/support/terminal/sessions/${id}`);
      if (!res.ok) break;
      const session = (await res.json()) as TerminalSession;
      setRunning(session.status === "running" ? session : null);
      setSessions((prev) => prev.map((s) => (s.id === id ? session : s)));
      if (session.status !== "running" && session.status !== "queued") break;
    }
  }

  async function cancel() {
    if (!running) return;
    await fetch("/api/support/terminal/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: running.id }),
    });
    setRunning(null);
  }

  const display = running ?? sessions[0];

  return (
    <div data-testid="terminal-panel">
      <div style={{ color: "var(--muted)", marginBottom: 6 }}>Allowlisted commands only · secrets redacted</div>
      <div className="ide-terminal-input-row">
        <span style={{ color: "var(--green)" }}>$</span>
        <input
          className="ide-chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void run()}
          placeholder="npm test"
          list="terminal-commands"
          data-testid="terminal-input"
        />
        <button type="button" onClick={() => void run()} data-testid="terminal-run">
          Run
        </button>
        {running && (
          <button type="button" onClick={() => void cancel()} data-testid="terminal-cancel">
            Cancel
          </button>
        )}
      </div>
      <datalist id="terminal-commands">
        {commands.map((c) => (
          <option key={c.id} value={c.command}>
            {c.label}
          </option>
        ))}
      </datalist>
      {error && <p style={{ color: "var(--red)" }}>{error}</p>}
      <pre ref={outputRef} className="ide-code-block" style={{ maxHeight: 140, marginTop: 8 }} data-testid="terminal-output">
        {display
          ? `$ ${display.command}\n${display.output.map((o) => o.text).join("")}\n[${display.status}${display.exitCode !== undefined ? ` exit ${display.exitCode}` : ""}]`
          : "Run npm test, npm run mcp:check, or npm run build"}
      </pre>
      {history.length > 0 && (
        <div style={{ fontSize: 10, color: "var(--muted)" }}>
          History: {history.slice(0, 5).join(" · ")}
        </div>
      )}
    </div>
  );
}
