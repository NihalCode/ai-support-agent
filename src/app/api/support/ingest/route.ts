import { NextResponse } from "next/server";
import { ingestRepo } from "@/lib/support/ingest";
import { audit } from "@/lib/support/audit";
import type { IngestRequest } from "@/lib/support/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as IngestRequest;
    const result = await ingestRepo({
      repoUrl: body.repoUrl,
      includeIssues: body.includeIssues,
      includePRs: body.includePRs,
    });
    await audit({
      action: "ingest",
      target: result.repo,
      approved: true,
      details: `${result.chunks} chunks, ${result.upserted} upserted (${result.usedMock.vectorStore ? "memory" : "pinecone"})`,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ingestion failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
