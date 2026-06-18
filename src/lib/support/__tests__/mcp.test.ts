import { describe, it, expect } from "vitest";
import { isWriteTool, classifyMcpTool } from "../mcp/guard";
import { parseRpcResponse } from "../mcp/client";
import type { McpToolDescriptor } from "../types";

describe("MCP write-tool detection", () => {
  it("flags mutating verbs as write", () => {
    expect(isWriteTool("create_issue")).toBe(true);
    expect(isWriteTool("delete_record")).toBe(true);
    expect(isWriteTool("update_tag", "modifies a tag")).toBe(true);
  });
  it("treats read verbs as non-write", () => {
    expect(isWriteTool("list_issues")).toBe(false);
    expect(isWriteTool("search_records", "query records")).toBe(false);
    expect(isWriteTool("get_user")).toBe(false);
  });
  it("defaults unknown tools to write (safer)", () => {
    expect(isWriteTool("frobnicate")).toBe(true);
  });
});

describe("classifyMcpTool", () => {
  const read: McpToolDescriptor = { server: "s", name: "list_x", isWrite: false };
  const write: McpToolDescriptor = { server: "s", name: "delete_x", isWrite: true };

  it("read tools need no approval", () => {
    const v = classifyMcpTool(read);
    expect(v.safetyClass).toBe("READ_ONLY");
    expect(v.requiresApproval).toBe(false);
  });

  it("write tools require approval", () => {
    const v = classifyMcpTool(write);
    expect(v.requiresApproval).toBe(true);
  });
});

describe("parseRpcResponse", () => {
  it("parses plain JSON-RPC", () => {
    const r = parseRpcResponse('{"jsonrpc":"2.0","id":1,"result":{"tools":[]}}');
    expect(r?.result).toEqual({ tools: [] });
  });

  it("parses an SSE event stream and picks the result message", () => {
    const sse = [
      "event: message",
      'data: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}',
      "",
    ].join("\n");
    const r = parseRpcResponse(sse);
    expect((r?.result as { ok: boolean }).ok).toBe(true);
  });

  it("surfaces JSON-RPC errors", () => {
    const r = parseRpcResponse('{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"no method"}}');
    expect(r?.error?.message).toBe("no method");
  });

  it("returns null for empty/garbage", () => {
    expect(parseRpcResponse("")).toBeNull();
    expect(parseRpcResponse("not json")).toBeNull();
  });
});
