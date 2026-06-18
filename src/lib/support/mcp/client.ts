import "server-only";

import type { McpServerConfig } from "../config";
import type { McpToolDescriptor, McpCallResult } from "../types";
import { safeFetch } from "../../ssrf";
import { isWriteTool } from "./guard";

/**
 * MCPClientService — a minimal remote MCP client speaking JSON-RPC 2.0 over the
 * Streamable HTTP transport (also accepts SSE responses). Local stdio servers
 * are intentionally out of scope for serverless deployments (documented as
 * local-dev-only). All requests go through the SSRF guard.
 */
export class MCPClientService {
  private readonly server: McpServerConfig;
  private sessionId: string | null = null;
  private nextId = 1;
  private initialized = false;

  constructor(server: McpServerConfig) {
    this.server = server;
  }

  get name() {
    return this.server.name;
  }

  private baseHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "User-Agent": "ai-support-agent-mcp",
      ...(this.server.headers ?? {}),
      ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
    };
  }

  private async rpc<T>(method: string, params?: unknown, isNotification = false): Promise<T | null> {
    const payload: Record<string, unknown> = { jsonrpc: "2.0", method };
    if (params !== undefined) payload.params = params;
    if (!isNotification) payload.id = this.nextId++;

    const res = await safeFetch(this.server.url, {
      method: "POST",
      headers: this.baseHeaders(),
      body: JSON.stringify(payload),
    });

    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;

    if (isNotification) return null;
    if (!res.ok) throw new Error(`MCP ${method} ${res.status}: ${res.text.slice(0, 200)}`);

    const parsed = parseRpcResponse(res.text);
    if (parsed?.error) {
      throw new Error(`MCP ${method} error: ${parsed.error.message ?? JSON.stringify(parsed.error)}`);
    }
    return (parsed?.result ?? null) as T | null;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.rpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "ai-support-agent", version: "1.0.0" },
    });
    await this.rpc("notifications/initialized", undefined, true);
    this.initialized = true;
  }

  async listTools(): Promise<McpToolDescriptor[]> {
    await this.initialize();
    const result = await this.rpc<{ tools?: RawTool[] }>("tools/list", {});
    return (result?.tools ?? []).map((t) => ({
      server: this.server.name,
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      outputSchema: t.outputSchema,
      isWrite: isWriteTool(t.name, t.description, t.inputSchema),
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      await this.initialize();
      const result = await this.rpc<{ content?: unknown; isError?: boolean }>("tools/call", {
        name,
        arguments: args,
      });
      if (result?.isError) {
        return { ok: false, server: this.server.name, tool: name, error: stringifyContent(result.content) };
      }
      return { ok: true, server: this.server.name, tool: name, content: result?.content };
    } catch (err) {
      return { ok: false, server: this.server.name, tool: name, error: err instanceof Error ? err.message : "call failed" };
    }
  }

  async ping(): Promise<{ ok: boolean; tools: number; error?: string }> {
    try {
      const tools = await this.listTools();
      return { ok: true, tools: tools.length };
    } catch (err) {
      return { ok: false, tools: 0, error: err instanceof Error ? err.message : "connection failed" };
    }
  }
}

interface RawTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
}

interface RpcResponse {
  result?: unknown;
  error?: { code?: number; message?: string };
}

/** Parse a JSON-RPC response that may be plain JSON or an SSE event stream. */
export function parseRpcResponse(text: string): RpcResponse | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed) as RpcResponse;
    } catch {
      /* fall through to SSE */
    }
  }
  // SSE: collect `data:` lines, parse the last JSON-RPC message with a result/error.
  const dataLines = trimmed
    .split(/\r?\n/)
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim())
    .filter(Boolean);
  for (let i = dataLines.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(dataLines[i]) as RpcResponse;
      if (obj && (obj.result !== undefined || obj.error !== undefined)) return obj;
    } catch {
      /* skip non-JSON data line */
    }
  }
  return null;
}

function stringifyContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((c) => (typeof c === "object" && c && "text" in c ? (c as { text: string }).text : JSON.stringify(c))).join("\n");
  }
  return JSON.stringify(content);
}
