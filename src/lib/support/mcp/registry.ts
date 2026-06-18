import "server-only";

import { getConfig } from "../config";
import type { McpServerConfig } from "../config";
import type { McpToolDescriptor, McpServerStatus } from "../types";
import { MCPClientService } from "./client";

/**
 * MCPToolRegistry — discovers and caches tools across all configured MCP
 * servers. Cache is in-memory per process with a short TTL so the UI/agent can
 * enumerate tools cheaply without re-handshaking on every request.
 */

interface CacheEntry {
  tools: McpToolDescriptor[];
  at: number;
}

const g = globalThis as unknown as { __mcpToolCache?: Map<string, CacheEntry> };
const cache: Map<string, CacheEntry> = (g.__mcpToolCache ??= new Map());
const TTL_MS = 60_000;

export function configuredServers(): McpServerConfig[] {
  return getConfig().mcpServers;
}

export function findServer(name: string): McpServerConfig | null {
  return configuredServers().find((s) => s.name === name) ?? null;
}

export function clientFor(name: string): MCPClientService | null {
  const server = findServer(name);
  return server ? new MCPClientService(server) : null;
}

export async function discoverTools(name: string, force = false): Promise<McpToolDescriptor[]> {
  const server = findServer(name);
  if (!server) return [];
  const cached = cache.get(name);
  if (!force && cached && Date.now() - cached.at < TTL_MS) return cached.tools;
  const tools = await new MCPClientService(server).listTools();
  cache.set(name, { tools, at: Date.now() });
  return tools;
}

export async function discoverAll(force = false): Promise<McpToolDescriptor[]> {
  const all: McpToolDescriptor[] = [];
  for (const server of configuredServers()) {
    try {
      all.push(...(await discoverTools(server.name, force)));
    } catch {
      // skip unreachable server; status endpoint surfaces the error
    }
  }
  return all;
}

export async function serverStatuses(): Promise<McpServerStatus[]> {
  const out: McpServerStatus[] = [];
  for (const server of configuredServers()) {
    const ping = await new MCPClientService(server).ping();
    out.push({
      name: server.name,
      url: server.url,
      transport: server.transport,
      connected: ping.ok,
      toolCount: ping.tools,
      error: ping.error,
    });
  }
  return out;
}

export function findTool(name: string): Promise<McpToolDescriptor | null> {
  const [server, tool] = name.includes(":") ? name.split(":") : [null, name];
  return (async () => {
    const tools = server ? await discoverTools(server) : await discoverAll();
    return tools.find((t) => t.name === tool || `${t.server}:${t.name}` === name) ?? null;
  })();
}
