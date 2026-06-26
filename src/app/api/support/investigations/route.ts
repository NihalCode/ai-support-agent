import { NextResponse } from "next/server";
import {
  listInvestigations,
  createInvestigation,
  getInvestigation,
  patchInvestigation,
  exportInvestigationMarkdown,
  ensureTestInvestigation,
} from "@/lib/support/investigation/object-store";
import type { InvestigationPatch } from "@/lib/support/investigation/object-types";
import { isTestMode } from "@/lib/test-mode";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const format = url.searchParams.get("format");

  if (isTestMode() && !id && listInvestigations().length === 0) {
    ensureTestInvestigation();
  }

  if (id) {
    const inv = getInvestigation(id);
    if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (format === "markdown") {
      return new NextResponse(exportInvestigationMarkdown(inv), {
        headers: { "Content-Type": "text/markdown" },
      });
    }
    return NextResponse.json(inv);
  }

  return NextResponse.json({ investigations: listInvestigations() });
}

export async function POST(req: Request) {
  const body = (await req.json()) as { title: string; userIssue: string; sessionId?: string };
  if (!body.title?.trim() || !body.userIssue?.trim()) {
    return NextResponse.json({ error: "title and userIssue required" }, { status: 400 });
  }
  const inv = createInvestigation(body);
  return NextResponse.json(inv);
}

export async function PATCH(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const patch = (await req.json()) as InvestigationPatch;
  const inv = patchInvestigation(id, patch);
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(inv);
}
