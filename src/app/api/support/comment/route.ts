import { NextResponse } from "next/server";
import { requireSupportApi, SupportApiPermission } from "@/lib/auth/support-api-auth";
import {
  draftCustomerComment,
  draftEngineeringNote,
  suggestTriageMeta,
} from "@/lib/support/comment";
import type { IssueAnalysis } from "@/lib/support/types";

export const runtime = "nodejs";

/**
 * Draft customer + engineering comments and advisory triage metadata from an
 * analysis. Pure drafting — performs NO external writes.
 */
export async function POST(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.read, req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json()) as { analysis?: IssueAnalysis; target?: "github" | "jira" };
    if (!body.analysis) {
      return NextResponse.json({ error: "Missing analysis." }, { status: 400 });
    }
    const customer = draftCustomerComment(body.analysis);
    const engineering = draftEngineeringNote(body.analysis);
    const meta = suggestTriageMeta(body.analysis);
    return NextResponse.json({ customer, engineering, meta, target: body.target ?? "github" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Comment drafting failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
