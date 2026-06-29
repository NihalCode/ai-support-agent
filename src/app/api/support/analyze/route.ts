import { NextResponse } from "next/server";
import { analyzeIssue } from "@/lib/support/analyze";
import { resolveRepoRef, ticketConnectorForRef } from "@/lib/support/connectors";
import { audit } from "@/lib/support/audit";
import type { AnalyzeRequest, AnalyzeResult, NormalizedIssue } from "@/lib/support/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AnalyzeRequest;
    if (!body.description?.trim() && !body.issueRef?.trim()) {
      return NextResponse.json(
        { error: "Provide a problem description or an issue/ticket reference." },
        { status: 400 }
      );
    }

    const { ref } = resolveRepoRef(body.repoUrl);
    const repoUrlProvided = Boolean(body.repoUrl?.trim());

    // Optionally pull in a linked ticket for richer context.
    let issue: NormalizedIssue | null = null;
    let ticketsMock = false;
    if (body.issueRef?.trim()) {
      const { connector, mock } = await ticketConnectorForRef(body.issueRef.trim(), ref);
      ticketsMock = mock;
      issue = await connector.getIssue(body.issueRef.trim());
    }

    const analysis = await analyzeIssue({
      ref,
      description: body.description ?? "",
      issue,
      repoUrlProvided,
    });

    await audit({
      action: "analyze",
      target: `${ref.owner}/${ref.name}${body.issueRef ? ` ${body.issueRef}` : ""}`,
      approved: true,
      details: `category=${analysis.category} fixability=${analysis.fixability} confidence=${analysis.confidence}`,
    });

    const result: AnalyzeResult = {
      analysis,
      issue,
      repo: `${ref.owner}/${ref.name}`,
      usedMock: { tickets: ticketsMock, vectorStore: analysis.retrievedContext.length === 0 ? true : false },
    };
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
