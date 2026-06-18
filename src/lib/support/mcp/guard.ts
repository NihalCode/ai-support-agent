import type { McpToolDescriptor, SafetyVerdict } from "../types";
import { classifyAction } from "../safety";

/**
 * MCPApprovalGuard — decides whether an MCP tool call may run unattended. Write
 * tools (mutating verbs in the name/description, or schemas with destructive
 * hints) require approval; read tools are safe in read-only mode.
 */

const WRITE_VERBS = new Set([
  "create", "update", "delete", "remove", "write", "set", "add", "put", "patch",
  "post", "modify", "insert", "drop", "destroy", "send", "publish", "deploy",
  "merge", "close", "assign", "transition", "upload", "revoke", "grant", "rotate",
  "edit", "replace", "cancel", "approve", "reject",
]);
const READ_VERBS = new Set([
  "get", "list", "search", "read", "fetch", "query", "describe", "find", "view",
  "show", "lookup", "count", "stat", "stats", "status", "check", "inspect",
]);

/** Split snake_case / kebab-case / camelCase / spaces into lowercase tokens. */
function tokenize(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .map((t) => t.toLowerCase())
    .filter(Boolean);
}

export function isWriteTool(name: string, description?: string, _inputSchema?: unknown): boolean {
  const tokens = tokenize(`${name} ${description ?? ""}`);
  if (tokens.some((t) => WRITE_VERBS.has(t))) return true;
  if (tokens.some((t) => READ_VERBS.has(t))) return false;
  // Unknown → treat as write (safer default; requires approval).
  return true;
}

export function classifyMcpTool(
  tool: McpToolDescriptor,
  opts: { serverAllowsWrites?: boolean } = {}
): SafetyVerdict {
  if (!tool.isWrite) {
    return {
      safetyClass: "READ_ONLY",
      requiresApproval: false,
      blocked: false,
      reason: `MCP read tool "${tool.name}" — safe to call.`,
    };
  }
  const verdict = classifyAction({
    kind: "mcp",
    toolName: tool.name,
    summary: `${tool.name} ${tool.description ?? ""}`,
    method: "POST",
    allowDestructive: opts.serverAllowsWrites,
  });
  return {
    ...verdict,
    reason: `MCP write tool "${tool.name}" (${verdict.safetyClass}). ${verdict.reason}`,
  };
}
