import "server-only";

import type { McpCallResult, SafetyVerdict } from "../types";
import { getConfig } from "../config";
import { clientFor, findServer, discoverTools } from "./registry";
import { classifyMcpTool } from "./guard";
import { audit } from "../audit";
import { redact, redactDeep } from "../redact";
import { canExecute } from "../safety";

/**
 * MCPToolExecutor + MCPAuditLogger. Builds an approval preview for a tool call,
 * enforces read-only / approval gating, executes via the MCP client, and audits
 * every attempt (redacted).
 */

export interface McpPreview {
  server: string;
  tool: string;
  args: Record<string, unknown>;
  safety: SafetyVerdict;
  preview: string;
}

export async function previewMcpCall(
  server: string,
  tool: string,
  args: Record<string, unknown>
): Promise<McpPreview | { error: string }> {
  const cfg = findServer(server);
  if (!cfg) return { error: `Unknown MCP server: ${server}` };
  const tools = await discoverTools(server);
  const descriptor = tools.find((t) => t.name === tool);
  if (!descriptor) return { error: `Tool "${tool}" not found on server "${server}"` };
  const safety = classifyMcpTool(descriptor, { serverAllowsWrites: cfg.allowWrites });
  const preview = redact(
    `MCP call → ${server}:${tool}\nargs: ${JSON.stringify(redactDeep(args), null, 2)}\nsafety: ${safety.safetyClass}`
  );
  return { server, tool, args, safety, preview };
}

export async function executeMcpCall(
  server: string,
  tool: string,
  args: Record<string, unknown>,
  opts: { approved: boolean }
): Promise<McpCallResult> {
  const cfg = getConfig();
  const preview = await previewMcpCall(server, tool, args);
  if ("error" in preview) {
    return { ok: false, server, tool, error: preview.error };
  }

  const gate = canExecute(preview.safety, { approved: opts.approved, readOnly: cfg.readOnly });
  if (!gate.ok) {
    await audit({
      action: `mcp:${tool}`,
      target: `${server}:${tool}`,
      approved: false,
      provider: "mcp",
      safetyClass: preview.safety.safetyClass,
      details: gate.reason,
    });
    return { ok: false, server, tool, error: gate.reason };
  }

  const client = clientFor(server);
  if (!client) return { ok: false, server, tool, error: `Unknown MCP server: ${server}` };

  const result = await client.callTool(tool, args);
  await audit({
    action: `mcp:${tool}`,
    target: `${server}:${tool}`,
    approved: opts.approved || preview.safety.safetyClass === "READ_ONLY",
    provider: "mcp",
    safetyClass: preview.safety.safetyClass,
    details: redact(result.ok ? "ok" : `error: ${result.error ?? "unknown"}`),
  });
  return result;
}
