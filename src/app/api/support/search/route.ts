import { NextResponse } from "next/server";
import { requireSupportApi, SupportApiPermission } from "@/lib/auth/support-api-auth";
import { workspaceSearch } from "@/lib/support/search/workspace-search";
import type { WorkspaceSearchRequest } from "@/lib/support/search/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.read, req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json()) as WorkspaceSearchRequest;
    if (!body.query?.trim()) {
      return NextResponse.json({ error: "query required" }, { status: 400 });
    }
    const result = await workspaceSearch(body);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 }
    );
  }
}

/** Alias for semantic search */
export async function GET(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.read, req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const mode = (url.searchParams.get("mode") ?? "hybrid") as WorkspaceSearchRequest["mode"];
  if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });
  const result = await workspaceSearch({ query: q, mode });
  return NextResponse.json(result);
}
