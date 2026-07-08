import { NextRequest, NextResponse } from "next/server";

import { verifyCronSecret } from "@/lib/cron/verify-cron-secret";
import { runKnowledgeSync } from "@/knowledge/ingestion/KnowledgeSyncService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Scheduled knowledge sync — protected by CRON_SECRET (not Auth0 session). */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runKnowledgeSync({ triggeredBy: "scheduled" });

  return NextResponse.json({
    ok: result.run.status !== "failed",
    run: result.run,
    sources: result.sources.map((s) => ({
      sourceId: s.sourceId,
      ok: s.ok,
      skipped: s.skipped,
      chunks: s.chunks,
      error: s.error,
    })),
  });
}
