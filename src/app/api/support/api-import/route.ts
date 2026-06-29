import { NextResponse } from "next/server";
import { requireSupportApi, SupportApiPermission } from "@/lib/auth/support-api-auth";
import type { ApiImportRequest } from "@/lib/support/types";
import { normalizeApiSource } from "@/lib/support/api-specs";
import { indexSpec, registerSpec, listSpecs, removeSpec } from "@/lib/support/api-specs/registry";
import { importCywareProduct, listCywareProductImportStatus } from "@/lib/support/api-specs/cyware-import";
import { ingestTheneoDocs, looksLikeTheneoUrl } from "@/lib/support/api-specs/theneo";
import { ingestPostmanDocumenter, looksLikePostmanDocumenterUrl } from "@/lib/support/api-specs/postman-documenter";
import type { CywareProductId } from "@/lib/support/cyware-products";
import { safeFetch } from "@/lib/ssrf";
import { audit } from "@/lib/support/audit";
import { redact } from "@/lib/support/redact";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Import an API source (OpenAPI/Swagger/Postman/markdown/cURL) by raw content
 * or public URL, normalize it into the common schema, and optionally index its
 * endpoints into the RAG store. Read-only operation (no external writes).
 *   GET            → list imported specs (summaries)
 *   POST {content|url, kind?, name?, index?}
 */
export async function GET(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.developer, req);
  if (auth instanceof NextResponse) return auth;

  const specs = listSpecs().map((s) => ({
    id: s.id,
    name: s.name,
    sourceKind: s.sourceKind,
    baseUrl: s.baseUrl,
    authType: s.authType,
    endpoints: s.endpoints.length,
  }));
  return NextResponse.json({ specs, cywareProducts: listCywareProductImportStatus() });
}

export async function POST(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.developer, req);
  if (auth instanceof NextResponse) return auth;

  let body: ApiImportRequest & { cywareProduct?: CywareProductId; delete?: string };
  try {
    body = (await req.json()) as ApiImportRequest & { cywareProduct?: CywareProductId; delete?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Delete a registered spec.
  if (body.delete) {
    const ok = removeSpec(body.delete);
    return NextResponse.json({ deleted: ok, id: body.delete });
  }

  // One-click Cyware product import (CSAP, CFTR, Orchestrate, CTIX).
  if (body.cywareProduct) {
    try {
      const result = await importCywareProduct(body.cywareProduct, { index: body.index !== false });
      await audit({
        action: "api-import:cyware-product",
        target: body.cywareProduct,
        approved: true,
        provider: body.cywareProduct,
        details: result.detail,
      });
      return NextResponse.json({
        product: body.cywareProduct,
        spec: summarize(result.spec),
        endpoints: result.spec.endpoints.length,
        indexed: result.indexed,
        warnings: result.warnings,
        source: result.source,
      });
    } catch (err) {
      return NextResponse.json(
        { error: redact(err instanceof Error ? err.message : "Cyware product import failed") },
        { status: 502 }
      );
    }
  }

  let content = body.content?.trim() ?? "";
  const sourceUrl = body.url?.trim();

  if (!content && sourceUrl) {
    // Cyware Theneo doc site → llms.txt ingest.
    if (looksLikeTheneoUrl(sourceUrl)) {
      try {
        const u = new URL(sourceUrl);
        const parts = u.pathname.split("/").filter(Boolean);
        const project = parts[0] ?? "api-reference";
        const result = await ingestTheneoDocs({
          origin: u.origin,
          project,
          name: body.name ?? project,
        });
        let spec = result.spec;
        if (body.name) spec = { ...spec, name: body.name };
        registerSpec(spec);
        let indexResult = null;
        if (body.index !== false) indexResult = await indexSpec(spec);
        return NextResponse.json({
          spec: summarize(spec),
          endpoints: spec.endpoints.length,
          indexed: indexResult,
          warnings: result.warnings,
          pagesFetched: result.pagesFetched,
        });
      } catch (err) {
        return NextResponse.json({ error: redact(err instanceof Error ? err.message : "Theneo ingest failed") }, { status: 502 });
      }
    }

    // Postman Documenter (CFTR) → collection JSON.
    if (looksLikePostmanDocumenterUrl(sourceUrl)) {
      try {
        const { spec, collectionUrl } = await ingestPostmanDocumenter(sourceUrl, body.name);
        registerSpec(spec);
        let indexResult = null;
        if (body.index !== false) indexResult = await indexSpec(spec);
        return NextResponse.json({
          spec: summarize(spec),
          endpoints: spec.endpoints.length,
          indexed: indexResult,
          collectionUrl,
        });
      } catch (err) {
        return NextResponse.json({ error: redact(err instanceof Error ? err.message : "Postman import failed") }, { status: 502 });
      }
    }

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
