import { NextResponse } from "next/server";
import { requireSupportApi, SupportApiPermission } from "@/lib/auth/support-api-auth";
import { ingestRepo } from "@/lib/support/ingest";
import { ingestEnterpriseKnowledge } from "@/lib/support/enterprise/knowledge-ingest";
import { audit } from "@/lib/support/audit";
import type { IngestRequest } from "@/lib/support/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.investigate, req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json()) as IngestRequest;
    const result = await ingestRepo({
      repoUrl: body.repoUrl,
      includeIssues: body.includeIssues,
      includePRs: body.includePRs,
    });
    const enterprise = body.includeEnterpriseKnowledge
      ? await ingestEnterpriseKnowledge()
      : null;
    await audit({
      action: "ingest",
      target: result.repo,
      approved: true,
      details: `${result.chunks} chunks, ${result.upserted} upserted (${result.usedMock.vectorStore ? "memory" : "pinecone"})${enterprise ? `; enterprise ${enterprise.upserted} upserted` : ""}`,
    });
    return NextResponse.json({ ...result, enterprise });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ingestion failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
