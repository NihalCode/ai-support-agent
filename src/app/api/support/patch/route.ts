import { NextResponse } from "next/server";
import { requireSupportApi, SupportApiPermission } from "@/lib/auth/support-api-auth";
import { generatePatch } from "@/lib/support/patch";
import type { IssueAnalysis } from "@/lib/support/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Generate an advisory code patch (diff) grounded in retrieved code. */
export async function POST(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.developer, req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json()) as { description?: string; analysis?: IssueAnalysis };
    if (!body.analysis) {
      return NextResponse.json({ error: "Missing analysis." }, { status: 400 });
    }
    const patch = await generatePatch({
      description: body.description ?? "",
      analysis: body.analysis,
    });
    return NextResponse.json({ patch });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Patch generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
