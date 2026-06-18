import { NextResponse } from "next/server";
import { getCywareConnector, type CywareFlow } from "@/lib/support/connectors/cyware";
import { listProviders } from "@/lib/support/providers";
import { getConfig } from "@/lib/support/config";
import { executeAction } from "@/lib/support/executor";
import { redact } from "@/lib/support/redact";

export const runtime = "nodejs";

/**
 * Cyware API provider endpoint.
 *   GET                              → providers + Cyware connection status
 *   POST {intent:"preview", method, path, query?, body?, flow?}  → resolved + safety
 *   POST {intent:"execute", method, path, query?, body?, approved} → approval-gated call
 * All Cyware write actions require approval; reads run when allowed.
 */
export async function GET() {
  const cyware = getCywareConnector();
  const status = cyware.configured ? await cyware.testConnection() : { ok: false, detail: "not configured" };
  return NextResponse.json({ providers: listProviders(), cyware: { configured: cyware.configured, ...status } });
}

interface CywareBody {
  intent: "preview" | "execute";
  method?: string;
  path?: string;
  query?: Record<string, string>;
  body?: unknown;
  flow?: CywareFlow;
  summary?: string;
  allowDestructive?: boolean;
  approved?: boolean;
}

export async function POST(req: Request) {
  let body: CywareBody;
  try {
    body = (await req.json()) as CywareBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const cyware = getCywareConnector();
  if (!cyware.configured) {
    return NextResponse.json({ error: "Cyware not configured (set CYWARE_BASE_URL + key)." }, { status: 400 });
  }

  // Resolve a high-level flow to an endpoint when provided.
  let method = body.method;
  let path = body.path;
  let flowEndpoint;
  if (body.flow) {
    const resolved = cyware.resolveFlow(body.flow);
    if (!resolved) {
      return NextResponse.json(
        { error: `No endpoint found for flow "${body.flow}". Import a Cyware API spec first (POST /api/support/api-import).` },
        { status: 422 }
      );
    }
    flowEndpoint = resolved;
    method = method ?? resolved.endpoint.method;
    path = path ?? resolved.endpoint.path;
  }

  if (!method || !path) {
    return NextResponse.json({ error: "method and path (or a known flow) are required" }, { status: 400 });
  }

  const plan = cyware.buildRequest(method, path, {
    query: body.query,
    body: body.body,
    summary: body.summary ?? (body.flow ? String(body.flow) : undefined),
    allowDestructive: body.allowDestructive,
  });

  if (body.intent === "preview") {
    return NextResponse.json({
      preview: {
        method: plan.method,
        url: redact(plan.url),
        headers: plan.redactedHeaders,
        body: plan.body ? redact(plan.body) : undefined,
        safety: plan.safety,
        flowEndpoint: flowEndpoint ? { spec: flowEndpoint.spec, name: flowEndpoint.endpoint.name } : undefined,
      },
    });
  }

  // execute
  if (plan.safety.blocked) {
    return NextResponse.json({ error: plan.safety.reason }, { status: 403 });
  }

  // Read-only calls run directly (no approval needed).
  if (plan.safety.safetyClass === "READ_ONLY") {
    try {
      const { safeFetch } = await import("@/lib/ssrf");
      const { audit } = await import("@/lib/support/audit");
      const res = await safeFetch(plan.url, { method: plan.method, headers: plan.headers });
      await audit({ action: "cyware:read", target: plan.url, approved: true, provider: "cyware", safetyClass: "READ_ONLY", details: `${plan.method} → ${res.status}` });
      return NextResponse.json({ result: { ok: res.ok, status: res.status, detail: redact(res.text.slice(0, 2000)) } });
    } catch (err) {
      return NextResponse.json({ error: redact(err instanceof Error ? err.message : "request failed") }, { status: 502 });
    }
  }

  // Write calls: approval-gated through the executor.
  if (getConfig().readOnly) {
    return NextResponse.json({ error: "Read-only mode enabled." }, { status: 403 });
  }
  if (!body.approved) {
    return NextResponse.json({ error: "This Cyware write action requires approval.", safety: plan.safety }, { status: 403 });
  }
  try {
    const result = await executeAction(
      { type: "api-call", provider: "cyware", method: plan.method, url: plan.url, headers: plan.headers, body: plan.body },
      { approved: true }
    );
    return NextResponse.json({ result: { ok: result.ok, detail: result.detail } });
  } catch (err) {
    return NextResponse.json({ error: redact(err instanceof Error ? err.message : "execution failed") }, { status: 500 });
  }
}
