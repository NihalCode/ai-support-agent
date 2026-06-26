import "server-only";

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { redact } from "@/lib/support/redact";
import { isTestMode } from "@/lib/test-mode";

export type TerminalSessionStatus = "queued" | "running" | "success" | "error" | "cancelled";

export interface TerminalOutputChunk {
  at: string;
  stream: "stdout" | "stderr";
  text: string;
}

export interface TerminalSession {
  id: string;
  command: string;
  cwd: string;
  status: TerminalSessionStatus;
  startedAt: string;
  finishedAt?: string;
  exitCode?: number;
  output: TerminalOutputChunk[];
}

/** Allowlisted npm/script commands — Option A safe runner. */
export const ALLOWLISTED_COMMANDS: { id: string; command: string; label: string }[] = [
  { id: "npm-test", command: "npm test", label: "Run unit tests" },
  { id: "npm-build", command: "npm run build", label: "Production build" },
  { id: "npm-lint", command: "npm run lint", label: "ESLint" },
  { id: "npm-typecheck", command: "npm run typecheck", label: "TypeScript check" },
  { id: "mcp-check", command: "npm run mcp:check", label: "MCP health check" },
  { id: "npm-dev", command: "npm run dev", label: "Dev server (long-running)" },
];

const BLOCKED_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bdel\s+\/s\b/i,
  /\bformat\s+[a-z]:/i,
  /\bcurl\s+.*\|\s*sh\b/i,
  /\.env\b/i,
  /SECRET|API_KEY|TOKEN/i,
];

const g = globalThis as unknown as {
  __terminalSessions?: Map<string, TerminalSession>;
  __terminalProcs?: Map<string, ChildProcessWithoutNullStreams>;
};

function sessions(): Map<string, TerminalSession> {
  if (!g.__terminalSessions) g.__terminalSessions = new Map();
  return g.__terminalSessions;
}

function procs(): Map<string, ChildProcessWithoutNullStreams> {
  if (!g.__terminalProcs) g.__terminalProcs = new Map();
  return g.__terminalProcs;
}

export function listTerminalCommands() {
  return ALLOWLISTED_COMMANDS;
}

export function getTerminalSession(id: string): TerminalSession | null {
  return sessions().get(id) ?? null;
}

export function validateCommand(command: string): { ok: boolean; error?: string; requiresApproval?: boolean } {
  const trimmed = command.trim();
  if (!trimmed) return { ok: false, error: "Empty command" };

  for (const pat of BLOCKED_PATTERNS) {
    if (pat.test(trimmed)) return { ok: false, error: "Command blocked for safety" };
  }

  const allowed = ALLOWLISTED_COMMANDS.some((c) => c.command === trimmed);
  if (allowed) return { ok: true };

  if (process.env.TERMINAL_DEVELOPER_MODE === "true") {
    return { ok: true, requiresApproval: true };
  }

  return {
    ok: false,
    error: `Command not allowlisted. Allowed: ${ALLOWLISTED_COMMANDS.map((c) => c.command).join(", ")}`,
  };
}

function mockOutput(command: string): TerminalOutputChunk[] {
  const now = new Date().toISOString();
  if (command.includes("mcp:check")) {
    return [
      { at: now, stream: "stdout", text: "MCP check (test mode): all servers OK\n" },
    ];
  }
  if (command.includes("test")) {
    return [
      { at: now, stream: "stdout", text: " RUN  vitest\n\n Test Files  24 passed\n      Tests  131 passed\n" },
    ];
  }
  return [{ at: now, stream: "stdout", text: `[test mode] ${command} completed\n` }];
}

export async function runTerminalCommand(
  command: string,
  opts: { approved?: boolean } = {}
): Promise<TerminalSession> {
  const validation = validateCommand(command);
  if (!validation.ok) throw new Error(validation.error);
  if (validation.requiresApproval && !opts.approved) {
    throw new Error("Developer-mode command requires explicit approval");
  }

  const id = crypto.randomUUID();
  const cwd = path.join(/* turbopackIgnore: true */ process.cwd());
  const session: TerminalSession = {
    id,
    command: command.trim(),
    cwd,
    status: "running",
    startedAt: new Date().toISOString(),
    output: [],
  };
  sessions().set(id, session);

  if (isTestMode()) {
    session.output = mockOutput(command);
    session.status = "success";
    session.exitCode = 0;
    session.finishedAt = new Date().toISOString();
    return session;
  }

  return new Promise((resolve) => {
    const [bin, ...args] = session.command.split(/\s+/);
    const child = spawn(bin, args, { cwd, shell: true, env: { ...process.env, FORCE_COLOR: "0" } });
    procs().set(id, child);

    const push = (stream: "stdout" | "stderr", text: string) => {
      session.output.push({ at: new Date().toISOString(), stream, text: redact(text) });
    };

    child.stdout.on("data", (d: Buffer) => push("stdout", d.toString()));
    child.stderr.on("data", (d: Buffer) => push("stderr", d.toString()));

    child.on("close", (code) => {
      procs().delete(id);
      session.exitCode = code ?? undefined;
      session.status = code === 0 ? "success" : "error";
      session.finishedAt = new Date().toISOString();
      resolve(session);
    });

    child.on("error", (err) => {
      procs().delete(id);
      session.status = "error";
      session.finishedAt = new Date().toISOString();
      push("stderr", err.message);
      resolve(session);
    });
  });
}

export function cancelTerminalSession(id: string): TerminalSession | null {
  const session = sessions().get(id);
  const proc = procs().get(id);
  if (!session) return null;
  if (proc) {
    proc.kill("SIGTERM");
    procs().delete(id);
  }
  session.status = "cancelled";
  session.finishedAt = new Date().toISOString();
  return session;
}

export function sessionOutputText(session: TerminalSession): string {
  return session.output.map((c) => c.text).join("");
}
