import { NextResponse } from "next/server";
import { requireSupportApi, SupportApiPermission } from "@/lib/auth/support-api-auth";
import type { CywareProductId } from "@/lib/support/cyware-products";
import { getCywareProductConnector, type CywareFlow } from "@/lib/support/connectors/cyware-product";
import { listProviders } from "@/lib/support/providers";
import { getConfig, configuredCywareProducts } from "@/lib/support/config";
import { executeAction } from "@/lib/support/executor";
import { redact } from "@/lib/support/redact";
import { metrics } from "@/metrics/MetricsService";

export const runtime = "nodejs";

/**
 * Cyware multi-product API endpoint (CTIX, CSAP, CFTR, Orchestrate).
 *   GET  ?product=ctix           → providers + connection status
 *   POST {product?, intent, method, path, query?, body?, flow?, approved?}
 */
export async function GET(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.read, req);
  if (auth instanceof NextResponse) return auth;

  const product = parseProduct(new URL(req.url).searchParams.get("product"));
  const conn = getCywareProductConnector(product);
  const status = conn.configured ? await conn.testConnection() : { ok: false, detail: "not configured" };

  const statuses: Record<string, { configured: boolean; ok: boolean; detail: string }> = {};
  for (const id of ["ctix", "csap", "cftr", "orchestrate"] as CywareProductId[]) {
    const c = getCywareProductConnector(id);
    statuses[id] = c.configured
      ? { configured: true, ...(await c.testConnection()) }
      : { configured: false, ok: false, detail: "not configured" };
  }

  return NextResponse.json({
    providers: listProviders(),
    product,
    cyware: { configured: conn.configured, ...status },
    products: statuses,
    configured: configuredCywareProducts(),
  });
}

interface CywareBody {
  product?: CywareProductId;
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

function parseProduct(raw: string | null | undefined): CywareProductId {
  const p = (raw ?? "ctix").toLowerCase();
  if (p === "csap" || p === "cftr" || p === "orchestrate" || p === "ctix") return p;
  return "ctix";
}

export async function POST(req: Request) {
  let body: CywareBody;
  try {
    body = (await req.json()) as CywareBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const perm =
    body.intent === "execute" ? SupportApiPermission.approve : SupportApiPermission.read;
  const auth = await requireSupportApi(perm, req);
  if (auth instanceof NextResponse) return auth;

  const product = body.product ?? "ctix";
  const cyware = getCywareProductConnector(product);
  if (!cyware.configured) {
    return NextResponse.json(
      { error: `${product.toUpperCase()} not configured (set ${product === "ctix" ? "CYWARE_" : product.toUpperCase() + "_"}BASE_URL + key).` },
      { status: 400 }
    );
  }

  let method = body.method;
  let path = body.path;
  let flowEndpoint;
  if (body.flow) {
    const resolved = cyware.resolveFlow(body.flow);
    if (!resolved) {
      return NextResponse.json(
        { error: `No endpoint found for flow "${body.flow}". Import the ${product} API spec first.` },
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
    void metrics.track({
      eventType: "api.lookup",
      category: "api",
      actorUserId: auth.user.id,
      actorRole: auth.user.role,
      metadata: { product, method, path },
    });
    return NextResponse.json({
      product,
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

  if (plan.safety.blocked) {
    return NextResponse.json({ error: plan.safety.reason }, { status: 403 });
  }

  if (plan.safety.safetyClass === "READ_ONLY") {
    try {
      const { safeFetch } = await import("@/lib/ssrf");
      const { audit } = await import("@/lib/support/audit");
      const res = await safeFetch(plan.url, { method: plan.method, headers: plan.headers, body: plan.body });
      await audit({
        action: `${product}:read`,
        target: plan.url,
        approved: true,
        provider: product,
        safetyClass: "READ_ONLY",
        details: `${plan.method} → ${res.status}`,
      });
      void metrics.track({
        eventType: "api.execute",
        category: "api",
        actorUserId: auth.user.id,
        actorRole: auth.user.role,
        metadata: { product, method: plan.method, readOnly: true },
      });
      return NextResponse.json({ result: { ok: res.ok, status: res.status, detail: redact(res.text.slice(0, 2000)) } });
    } catch (err) {
      return NextResponse.json({ error: redact(err instanceof Error ? err.message : "request failed") }, { status: 502 });
    }
  }

  if (getConfig().readOnly) {
    return NextResponse.json({ error: "Read-only mode enabled." }, { status: 403 });
  }
  if (!body.approved) {
    return NextResponse.json({ error: "This write action requires approval.", safety: plan.safety }, { status: 403 });
  }
  try {
    const result = await executeAction(
      { type: "api-call", provider: product, method: plan.method, url: plan.url, headers: plan.headers, body: plan.body },
      { approved: true }
    );
    void metrics.track({
      eventType: "api.execute",
      category: "api",
      actorUserId: auth.user.id,
      actorRole: auth.user.role,
      success: result.ok,
      metadata: { product, method: plan.method, readOnly: false },
    });
    return NextResponse.json({ result: { ok: result.ok, detail: result.detail } });
  } catch (err) {
    return NextResponse.json({ error: redact(err instanceof Error ? err.message : "execution failed") }, { status: 500 });
  }
}
