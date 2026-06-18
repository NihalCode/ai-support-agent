import { NextResponse } from "next/server";
import { serverStatuses, discoverAll, discoverTools } from "@/lib/support/mcp/registry";
import { previewMcpCall, executeMcpCall } from "@/lib/support/mcp/executor";
import { getConfig } from "@/lib/support/config";
import { redactDeep } from "@/lib/support/redact";

export const runtime = "nodejs";

/**
 * MCP server API (remote HTTP/SSE servers configured via MCP_SERVER_CONFIG_JSON).
 *   GET  ?server=NAME&tools=1  → server statuses (+ tools for one server)
 *   POST {intent:"preview", server, tool, args}  → safety + resolved preview
 *   POST {intent:"execute", server, tool, args, approved} → guarded execution
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const server = url.searchParams.get("server");
  const wantTools = url.searchParams.get("tools");

  const statuses = await serverStatuses();
  if (server && wantTools) {
    try {
      const tools = await discoverTools(server, true);
      return NextResponse.json({ statuses, tools });
    } catch (err) {
      return NextResponse.json({ statuses, tools: [], error: String(err) });
    }
  }
  const tools = await discoverAll();
  return NextResponse.json({ statuses, tools });
}

interface McpBody {
  intent: "preview" | "execute";
  server: string;
  tool: string;
  args?: Record<string, unknown>;
  approved?: boolean;
}

export async function POST(req: Request) {
  let body: McpBody;
  try {
    body = (await req.json()) as McpBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.server || !body.tool) {
    return NextResponse.json({ error: "server and tool are required" }, { status: 400 });
  }
  const args = body.args ?? {};

  if (body.intent === "preview") {
    const preview = await previewMcpCall(body.server, body.tool, args);
    if ("error" in preview) return NextResponse.json({ error: preview.error }, { status: 404 });
    return NextResponse.json({ preview: { ...preview, args: redactDeep(preview.args) } });
  }

  if (body.intent === "execute") {
    if (getConfig().readOnly) {
      return NextResponse.json({ error: "Read-only mode enabled." }, { status: 403 });
    }
    const result = await executeMcpCall(body.server, body.tool, args, { approved: Boolean(body.approved) });
    const status = result.ok ? 200 : 403;
    return NextResponse.json({ result }, { status });
  }

  return NextResponse.json({ error: "Unknown intent" }, { status: 400 });
}
