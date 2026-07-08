import { type NextRequest, NextResponse } from "next/server";

import { requireInvestigateRead } from "@/integrations/core/integration-api-auth";
import {
  handleJiraCreateDraft,
  handleJiraLink,
  handleJiraWriteRequest,
  integrationErrorResponse,
} from "@/integrations/core/integration-actions";
import { metrics } from "@/metrics/MetricsService";

export const runtime = "nodejs";

function trackJira(
  user: { id: string; role: string },
  action: string,
  extra?: Record<string, unknown>
) {
  void metrics.track({
    eventType: "integration.jira.action",
    category: "integration",
    actorUserId: user.id,
    actorRole: user.role,
    metadata: { integration: "jira", action, ...extra },
  });
}

export async function POST(request: NextRequest) {
  const sessionOrResponse = await requireInvestigateRead(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  let body:
    | { action: "link"; investigationId: string; issueKey: string }
    | { action: "draft_create"; summary: string; description: string; projectKey?: string }
    | { action: "request_create"; summary: string; description: string; projectKey?: string }
    | { action: "request_comment"; issueKey: string; body: string }
    | { action: "request_update"; issueKey: string; transition: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if (body.action === "link") {
      trackJira(sessionOrResponse.user, "link", { issueKey: body.issueKey });
      return NextResponse.json(
        await handleJiraLink(body.investigationId, body.issueKey, sessionOrResponse.user.id)
      );
    }

    if (body.action === "draft_create") {
      trackJira(sessionOrResponse.user, "draft_create");
      return NextResponse.json(
        await handleJiraCreateDraft({
          summary: body.summary,
          description: body.description,
          projectKey: body.projectKey,
        })
      );
    }

    if (body.action === "request_create") {
      const draft = await handleJiraCreateDraft({
        summary: body.summary,
        description: body.description,
        projectKey: body.projectKey,
      });
      const approval = await handleJiraWriteRequest(
        sessionOrResponse.user.id,
        {
          type: "jira-create",
          projectKey: draft.draft.projectKey,
          summary: body.summary,
          description: body.description,
          issueType: draft.draft.issueType,
        },
        body.description
      );
      trackJira(sessionOrResponse.user, "request_create");
      return NextResponse.json({ ...approval, draft: draft.draft });
    }

    if (body.action === "request_comment") {
      const approval = await handleJiraWriteRequest(
        sessionOrResponse.user.id,
        {
          type: "ticket-comment",
          provider: "jira",
          ref: body.issueKey,
          body: body.body,
        },
        body.body
      );
      trackJira(sessionOrResponse.user, "request_comment", { issueKey: body.issueKey });
      return NextResponse.json(approval);
    }

    if (body.action === "request_update") {
      const approval = await handleJiraWriteRequest(
        sessionOrResponse.user.id,
        {
          type: "jira-transition",
          ref: body.issueKey,
          transition: body.transition,
        },
        `${body.issueKey} → ${body.transition}`
      );
      trackJira(sessionOrResponse.user, "request_update", { issueKey: body.issueKey });
      return NextResponse.json(approval);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return integrationErrorResponse(err, 500);
  }
}
