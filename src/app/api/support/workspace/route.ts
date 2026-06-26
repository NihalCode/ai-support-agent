import { NextResponse } from "next/server";
import { getSpec, listSpecs } from "@/lib/support/api-specs/registry";

export const runtime = "nodejs";

/**
 * Workspace snapshot for IDE panels.
 * GET ?specId=... → endpoints for one spec
 * GET (no params) → specs + integration summary hooks
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const specId = url.searchParams.get("specId");

  if (specId) {
    const spec = getSpec(specId);
    if (!spec) return NextResponse.json({ error: "Spec not found" }, { status: 404 });
    return NextResponse.json({
      spec: {
        id: spec.id,
        name: spec.name,
        sourceKind: spec.sourceKind,
        baseUrl: spec.baseUrl,
        authType: spec.authType,
      },
      endpoints: spec.endpoints.map((e) => ({
        method: e.method,
        path: e.path,
        name: e.name,
        description: e.description,
        effect: e.effect,
        group: e.group,
        queryParams: e.queryParams,
        pathParams: e.pathParams,
        requiredFields: e.requiredFields,
      })),
    });
  }

  const specs = listSpecs().map((s) => ({
    id: s.id,
    name: s.name,
    sourceKind: s.sourceKind,
    authType: s.authType,
    endpoints: s.endpoints.length,
  }));

  return NextResponse.json({ specs });
}
