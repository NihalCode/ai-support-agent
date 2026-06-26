import "server-only";

import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { isTestMode } from "@/lib/test-mode";

export type CommandStatus = "success" | "failed" | "cancelled" | "timed_out";

/** Real npm install/build on Vercel serverless is unreliable (home dir, timeouts). */
export function shouldMockProjectCommands(): boolean {
  if (isTestMode()) return true;
  if (process.env.BUILD_APP_REAL_COMMANDS === "true") return false;
  if (process.env.VERCEL === "1") return true;
  return false;
}

function npmEnvForCwd(cwd: string): NodeJS.ProcessEnv {
  const cacheDir = path.join(cwd, ".npm-cache");
  mkdirSync(cacheDir, { recursive: true });
  return {
    ...process.env,
    HOME: cwd,
    USERPROFILE: cwd,
    npm_config_cache: cacheDir,
    npm_config_update_notifier: "false",
    CI: "true",
    npm_config_fund: "false",
    npm_config_audit: "false",
  };
}

export interface CommandResult {
  command: string;
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  startedAt: string;
  finishedAt: string;
  status: CommandStatus;
  mock?: boolean;
}

export function runCommand(
  command: string,
  cwd: string,
  opts: { timeoutMs?: number; mock?: boolean; mockOutput?: string; mockExitCode?: number } = {}
): CommandResult {
  const startedAt = new Date().toISOString();

  if (opts.mock ?? shouldMockProjectCommands()) {
    const exitCode = opts.mockExitCode ?? 0;
    const combined = opts.mockOutput ?? `[MOCK] ${command} in ${cwd}\n`;
    return {
      command,
      cwd,
      exitCode,
      stdout: combined,
      stderr: exitCode !== 0 ? combined : "",
      startedAt,
      finishedAt: new Date().toISOString(),
      status: exitCode === 0 ? "success" : "failed",
      mock: true,
    };
  }

  try {
    const stdout = execSync(command, {
      cwd,
      encoding: "utf8",
      timeout: opts.timeoutMs ?? 120_000,
      stdio: ["pipe", "pipe", "pipe"],
      env: npmEnvForCwd(cwd),
    });
    return {
      command,
      cwd,
      exitCode: 0,
      stdout,
      stderr: "",
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "success",
    };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string; message?: string };
    const stdout = err.stdout ?? "";
    const stderr = [err.stderr, err.message].filter(Boolean).join("\n");
    const exitCode = typeof err.status === "number" ? err.status : 1;
    return {
      command,
      cwd,
      exitCode,
      stdout,
      stderr,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: exitCode === 0 ? "success" : err.message?.includes("ETIMEDOUT") ? "timed_out" : "failed",
    };
  }
}

export function formatCommandLog(results: CommandResult[]): string {
  return results
    .map((r) => {
      const tag = r.mock ? "[MOCK] " : "";
      const head = `${tag}$ ${r.command} (exit ${r.exitCode ?? "?"})\n  cwd: ${r.cwd}`;
      const body = [r.stdout, r.stderr].filter(Boolean).join("\n").trim();
      return body ? `${head}\n${body}` : head;
    })
    .join("\n\n");
}

export function allCommandsSucceeded(results: CommandResult[]): boolean {
  return results.length > 0 && results.every((r) => r.status === "success" && r.exitCode === 0);
}
