import { NextResponse } from "next/server";
import type { ApiImportRequest } from "@/lib/support/types";
import { normalizeApiSource } from "@/lib/support/api-specs";
import { indexSpec, registerSpec, listSpecs } from "@/lib/support/api-specs/registry";
import { safeFetch } from "@/lib/ssrf";
import { audit } from "@/lib/support/audit";
import { redact } from "@/lib/support/redact";

export const runtime = "nodejs";

/**
 * Import an API source (OpenAPI/Swagger/Postman/markdown/cURL) by raw content
 * or public URL, normalize it into the common schema, and optionally index its
 * endpoints into the RAG store. Read-only operation (no external writes).
 *   GET            → list imported specs (summaries)
 *   POST {content|url, kind?, name?, index?}
 */
export async function GET() {
  const specs = listSpecs().map((s) => ({
    id: s.id,
    name: s.name,
    sourceKind: s.sourceKind,
    baseUrl: s.baseUrl,
    authType: s.authType,
    endpoints: s.endpoints.length,
  }));
  return NextResponse.json({ specs });
}

export async function POST(req: Request) {
  let body: ApiImportRequest;
  try {
    body = (await req.json()) as ApiImportRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let content = body.content?.trim() ?? "";
  const sourceUrl = body.url?.trim();

  if (!content && sourceUrl) {
    try {
      const res = await safeFetch(sourceUrl, { headers: { Accept: "application/json, text/yaml, text/plain, */*" } });
      if (!res.ok) {
        return NextResponse.json({ error: `Failed to fetch spec (${res.status})` }, { status: 502 });
      }
      content = res.text;
    } catch (err) {
      return NextResponse.json({ error: redact(err instanceof Error ? err.message : "fetch failed") }, { status: 502 });
    }
  }

  if (!content) {
    return NextResponse.json({ error: "Provide `content` or a fetchable `url`." }, { status: 400 });
  }

  let spec;
  try {
    spec = normalizeApiSource(content, { kind: body.kind, name: body.name, sourceUrl });
  } catch (err) {
    return NextResponse.json(
      { error: redact(`Could not parse API source: ${err instanceof Error ? err.message : String(err)}`) },
      { status: 422 }
    );
  }

  if (spec.endpoints.length === 0) {
    return NextResponse.json(
      { error: "No endpoints found in the provided source.", spec: summarize(spec) },
      { status: 422 }
    );
  }

  let indexResult: { namespace: string; chunks: number; usedMockStore: boolean; usedOpenAI: boolean } | null = null;
  if (body.index) {
    try {
      indexResult = await indexSpec(spec);
    } catch (err) {
      registerSpec(spec);
      indexResult = null;
      await audit({ action: "api-import:index-failed", target: spec.id, approved: false, details: redact(String(err)) });
    }
  } else {
    registerSpec(spec);
  }

  await audit({
    action: "api-import",
    target: spec.id,
    approved: true,
    provider: spec.sourceKind,
    details: `${spec.endpoints.length} endpoints${indexResult ? `, ${indexResult.chunks} chunks indexed` : ""}`,
  });

  return NextResponse.json({
    spec: summarize(spec),
    endpoints: spec.endpoints.map((e) => ({
      method: e.method,
      path: e.path,
      name: e.name,
      effect: e.effect,
      group: e.group,
      requiredQuery: e.queryParams.filter((p) => p.required).map((p) => p.name),
      requiredFields: e.requiredFields,
    })),
    indexed: indexResult,
  });
}

function summarize(spec: { id: string; name: string; sourceKind: string; baseUrl: string | null; authType: string; endpoints: unknown[] }) {
  return {
    id: spec.id,
    name: spec.name,
    sourceKind: spec.sourceKind,
    baseUrl: spec.baseUrl,
    authType: spec.authType,
    endpoints: spec.endpoints.length,
  };
}
