import { NextResponse } from "next/server";
import { requireSupportApi, SupportApiPermission } from "@/lib/auth/support-api-auth";
import { buildSpecRequest, findSpecEndpoint } from "@/lib/support/api-execute";
import { getSpec, listSpecs } from "@/lib/support/api-specs/registry";
import { getConfig } from "@/lib/support/config";
import { executeAction } from "@/lib/support/executor";
import { redact } from "@/lib/support/redact";
import { metrics } from "@/metrics/MetricsService";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Generic API execution for ANY imported spec (OpenAPI, Postman, Cyware products).
 *   GET  → list specs + endpoint counts
 *   POST {intent:"preview"|"execute", specId, method?, path?, query?, body?, search?, approved?}
 */
export async function GET(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.read, req);
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json({
    specs: listSpecs().map((s) => ({
      id: s.id,
      name: s.name,
      sourceKind: s.sourceKind,
      baseUrl: s.baseUrl,
      endpoints: s.endpoints.length,
    })),
  });
}

interface ExecuteBody {
  intent: "preview" | "execute";
  specId: string;
  method?: string;
  path?: string;
  query?: Record<string, string>;
  body?: unknown;
  /** NL search to pick an endpoint when method/path omitted. */
  search?: string;
  summary?: string;
  allowDestructive?: boolean;
  approved?: boolean;
}

export async function POST(req: Request) {
  let body: ExecuteBody;
  try {
    body = (await req.json()) as ExecuteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const perm =
    body.intent === "execute" ? SupportApiPermission.approve : SupportApiPermission.read;
  const auth = await requireSupportApi(perm, req);
  if (auth instanceof NextResponse) return auth;

  if (!body.specId?.trim()) {
    return NextResponse.json({ error: "specId is required" }, { status: 400 });
  }

  const spec = getSpec(body.specId.trim());
  if (!spec) {
    return NextResponse.json({ error: `Spec "${body.specId}" not found. Import it first.` }, { status: 404 });
  }

  let method = body.method;
  let path = body.path;
  if ((!method || !path) && body.search?.trim()) {
    const ep = findSpecEndpoint(body.specId, body.search.trim());
    if (!ep) {
      return NextResponse.json({ error: `No endpoint matched "${body.search}" in spec ${body.specId}.` }, { status: 422 });
    }
    method = method ?? ep.method;
    path = path ?? ep.path;
  }

  if (!method || !path) {
    return NextResponse.json({ error: "method and path (or search) are required" }, { status: 400 });
  }

  let plan;
  try {
    plan = buildSpecRequest(body.specId, method, path, {
      query: body.query,
      body: body.body,
      summary: body.summary ?? body.search,
      allowDestructive: body.allowDestructive,
    });
  } catch (err) {
    return NextResponse.json({ error: redact(err instanceof Error ? err.message : String(err)) }, { status: 400 });
  }

  if (body.intent === "preview") {
    void metrics.track({
      eventType: "api.lookup",
      category: "api",
      actorUserId: auth.user.id,
      actorRole: auth.user.role,
      metadata: { specId: body.specId, method, path },
    });
    return NextResponse.json({
      preview: {
        specId: plan.specId,
        method: plan.method,
        url: redact(plan.url),
        headers: plan.redactedHeaders,
        body: plan.body ? redact(plan.body) : undefined,
        safety: plan.safety,
        endpoint: plan.endpoint ? { name: plan.endpoint.name, effect: plan.endpoint.effect } : undefined,
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
        action: "api:read",
        target: plan.url,
        approved: true,
        provider: plan.specId,
        safetyClass: "READ_ONLY",
        details: `${plan.method} → ${res.status}`,
      });
      void metrics.track({
        eventType: "api.execute",
        category: "api",
        actorUserId: auth.user.id,
        actorRole: auth.user.role,
        metadata: { specId: plan.specId, method: plan.method, readOnly: true, status: res.status },
      });
      return NextResponse.json({
        result: { ok: res.ok, status: res.status, detail: redact(res.text.slice(0, 4000)) },
      });
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
      {
        type: "api-call",
        provider: plan.specId,
        method: plan.method,
        url: plan.url,
        headers: plan.headers,
        body: plan.body,
      },
      { approved: true }
    );
    void metrics.track({
      eventType: "api.execute",
      category: "api",
      actorUserId: auth.user.id,
      actorRole: auth.user.role,
      success: result.ok,
      metadata: { specId: plan.specId, method: plan.method, readOnly: false },
    });
    return NextResponse.json({ result: { ok: result.ok, detail: result.detail } });
  } catch (err) {
    return NextResponse.json({ error: redact(err instanceof Error ? err.message : "execution failed") }, { status: 500 });
  }
}
