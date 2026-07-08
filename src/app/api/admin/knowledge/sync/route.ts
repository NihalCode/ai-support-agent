import { NextRequest, NextResponse } from "next/server";

import { requirePermission } from "@/lib/auth/session";
import { runKnowledgeSync } from "@/knowledge/ingestion/KnowledgeSyncService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin-only manual knowledge sync trigger. */
export async function POST(request: NextRequest) {
  const session = await requirePermission("users:write", request);
  if (session instanceof NextResponse) return session;

  let body: { sourceIds?: string[]; force?: boolean } = {};
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      body = (await request.json()) as typeof body;
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await runKnowledgeSync({
    triggeredBy: "manual",
    sourceIds: body.sourceIds,
    force: Boolean(body.force),
  });

  return NextResponse.json({
    ok: result.run.status !== "failed",
    run: result.run,
    sources: result.sources,
  });
}
