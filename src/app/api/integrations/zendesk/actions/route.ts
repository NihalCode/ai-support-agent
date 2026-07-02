import { NextResponse } from "next/server";

import { requireInvestigateRead } from "@/integrations/core/integration-api-auth";
import {
  handleZendeskCreateDraft,
  handleZendeskLink,
  handleZendeskWriteRequest,
  integrationErrorResponse,
} from "@/integrations/core/integration-actions";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sessionOrResponse = await requireInvestigateRead();
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  let body:
    | {
        action: "link";
        investigationId: string;
        ticketId: string;
      }
    | {
        action: "draft_reply" | "draft_note" | "create";
        investigationId?: string;
        ticketId?: string;
        subject?: string;
        body: string;
        public?: boolean;
      }
    | {
        action: "request_reply" | "request_note" | "request_create";
        ticketId?: string;
        subject?: string;
        body: string;
        public?: boolean;
        requesterEmail?: string;
      };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if (body.action === "link") {
      if (!body.investigationId || !body.ticketId) {
        return NextResponse.json({ error: "investigationId and ticketId required" }, { status: 400 });
      }
      return NextResponse.json(
        await handleZendeskLink(body.investigationId, body.ticketId, sessionOrResponse.user.id)
      );
    }

    if (body.action === "draft_reply" || body.action === "draft_note") {
      return NextResponse.json({
        draft: { ticketId: body.ticketId, body: body.body, public: body.action === "draft_reply" },
      });
    }

    if (body.action === "create") {
      return NextResponse.json(
        await handleZendeskCreateDraft({
          subject: body.subject ?? "Support request",
          body: body.body,
        })
      );
    }

    if (body.action === "request_reply" || body.action === "request_note") {
      if (!body.ticketId) {
        return NextResponse.json({ error: "ticketId required" }, { status: 400 });
      }
      const approval = await handleZendeskWriteRequest(
        sessionOrResponse.user.id,
        {
          type: "ticket-comment",
          provider: "zendesk",
          ref: body.ticketId,
          body: body.body,
          public: body.action === "request_reply",
        },
        body.body
      );
      return NextResponse.json(approval);
    }

    if (body.action === "request_create") {
      const approval = await handleZendeskWriteRequest(
        sessionOrResponse.user.id,
        {
          type: "zendesk-create",
          subject: body.subject ?? "Support request",
          body: body.body,
          requesterEmail: body.requesterEmail,
        },
        body.body
      );
      return NextResponse.json(approval);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return integrationErrorResponse(err, 500);
  }
}
