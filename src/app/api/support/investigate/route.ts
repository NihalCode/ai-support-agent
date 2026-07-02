import { NextResponse } from "next/server";
import { requireSupportApi, SupportApiPermission } from "@/lib/auth/support-api-auth";
import { runInvestigation, runInvestigationChat } from "@/lib/support/agents/orchestratorAgent";
import { getSession } from "@/lib/support/investigation/session-store";
import type { InvestigateRequest } from "@/lib/support/investigation/types";
import { audit } from "@/lib/support/audit";
import { redactDeep } from "@/lib/support/redact";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.read, req);
  if (auth instanceof NextResponse) return auth;

  const id = new URL(req.url).searchParams.get("sessionId");
  if (!id) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  const ctx = await getSession(id);
  if (!ctx) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  return NextResponse.json(redactDeep({ context: ctx, report: ctx.report }));
}

export async function POST(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.investigate, req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json()) as InvestigateRequest;

    if (body.sessionId && body.message?.trim()) {
      const { reply, citations } = await runInvestigationChat(body.sessionId, body.message.trim());
      await audit({
        action: "investigate-chat",
        target: body.sessionId,
        approved: true,
        details: body.message.slice(0, 200),
      });
        return NextResponse.json({ sessionId: body.sessionId, chatReply: reply, citations });
    }

    if (!body.query?.text?.trim() && !body.query?.issueRef) {
      return NextResponse.json({ error: "Provide query.text or query.issueRef" }, { status: 400 });
    }

    const result = await runInvestigation(body.query);
    await audit({
      action: "investigate",
      target: result.sessionId,
      approved: true,
      details: `status=${result.report.currentStatus} confidence=${result.report.confidence}`,
    });

    return NextResponse.json(redactDeep(result));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Investigation failed";
    return NextResponse.json({ error: message }, { status: message.includes("not found") ? 404 : 500 });
  }
}
