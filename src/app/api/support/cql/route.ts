import { NextResponse } from "next/server";
import { requireSupportApi, SupportApiPermission } from "@/lib/auth/support-api-auth";
import { ingestCqlDocs, DEFAULT_CQL_DOC_URL } from "@/lib/support/cql/ingest-docs";
import { generateCql } from "@/lib/support/cql/generate";
import { audit } from "@/lib/support/audit";
import { redact } from "@/lib/support/redact";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cyware Query Language API.
 *   POST {intent:"index", url?}  → fetch + index the CQL docs into the RAG store
 *   POST {query}                 → generate grounded CQL + structured output
 */
interface CqlBody {
  intent?: "index" | "generate";
  url?: string;
  /** Paste CQL doc text directly when the live URL is JS-rendered. */
  content?: string;
  query?: string;
  /** Alias for query (legacy / external callers). */
  prompt?: string;
}

export async function POST(req: Request) {
  let body: CqlBody;
  try {
    body = (await req.json()) as CqlBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const perm =
    body.intent === "index" ? SupportApiPermission.developer : SupportApiPermission.read;
  const auth = await requireSupportApi(perm, req);
  if (auth instanceof NextResponse) return auth;

  if (body.intent === "index") {
    try {
      const result = await ingestCqlDocs(body.url || DEFAULT_CQL_DOC_URL, body.content);
      await audit({
        action: "cql:index",
        target: result.url,
        approved: true,
        provider: "cyware-cql",
        details: `${result.chunks} chunks, ${result.pagesFetched} pages (${result.fetchedChars} chars)`,
      });
      return NextResponse.json({ result });
    } catch (err) {
      return NextResponse.json({ error: redact(err instanceof Error ? err.message : "index failed") }, { status: 502 });
    }
  }

  const query = body.query?.trim() ?? body.prompt?.trim();
  if (!query) {
    return NextResponse.json({ error: "Provide a `query` to convert to CQL." }, { status: 400 });
  }

  try {
    const result = await generateCql(query);
    await audit({
      action: "cql:generate",
      target: query.slice(0, 80),
      approved: result.effect === "read",
      provider: "cyware-cql",
      safetyClass: result.effect === "read" ? "READ_ONLY" : "WRITE_MEDIUM_RISK",
      details: result.cql ? "generated" : `missing: ${(result.missingInfo ?? []).join("; ").slice(0, 160)}`,
    });
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json({ error: redact(err instanceof Error ? err.message : "generation failed") }, { status: 500 });
  }
}
