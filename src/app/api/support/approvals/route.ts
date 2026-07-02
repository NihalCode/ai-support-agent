import { NextResponse } from "next/server";
import { requireSupportApi, SupportApiPermission } from "@/lib/auth/support-api-auth";
import {
  enqueueApproval,
  getApproval,
  listApprovals,
  claimApprovalForExecution,
  claimApprovalRejection,
  setApprovalStatus,
} from "@/lib/support/approvals";
import { classifyAction } from "@/lib/support/safety";
import { executeAction } from "@/lib/support/executor";
import { getConfig } from "@/lib/support/config";
import { audit } from "@/lib/support/enterprise/audit-log";
import { postSlackMessage } from "@/lib/support/slack/client";
import { buildApprovalBlocks } from "@/lib/support/slack/approval-cards";
import { createNotification } from "@/lib/support/enterprise/stores/notification-store";
import type { ApprovalAction, ApprovalStatus, PlannedAction } from "@/lib/support/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.read, req);
  if (auth instanceof NextResponse) return auth;

  const status = new URL(req.url).searchParams.get("status") as ApprovalStatus | null;
  return NextResponse.json({ approvals: await listApprovals(status ?? undefined) });
}

interface CreateBody {
  intent: "create";
  action: ApprovalAction;
  planned: PlannedAction;
  preview: string;
  slack?: { channel: string; threadTs?: string };
}
interface DecisionBody {
  intent: "approve" | "reject";
  id: string;
}

export async function POST(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.approve, req);
  if (auth instanceof NextResponse) return auth;

  let body: CreateBody | DecisionBody;
  try {
    body = (await req.json()) as CreateBody | DecisionBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.intent === "create") {
    const safety = classifyAction(body.planned);
    const approval = await enqueueApproval({
      action: body.action,
      safety,
      preview: body.preview,
      requestedByUserId: auth.user.id,
    });
    await audit({
      action: `approval:create:${body.action.type}`,
      target: previewTarget(body.action),
      approved: false,
      safetyClass: safety.safetyClass,
      details: safety.reason,
      actorId: auth.user.id,
      actorEmail: auth.user.email,
    });
    await createNotification({
      userId: auth.user.id,
      level: "warning",
      title: "Approval requested",
      message: approval.preview.slice(0, 200),
    }).catch(() => undefined);
    if (body.slack?.channel) {
      await postSlackMessage({
        channel: body.slack.channel,
        threadTs: body.slack.threadTs,
        text: `Approval required for ${body.action.type}`,
        blocks: buildApprovalBlocks(approval),
      }).catch(() => undefined);
    }
    return NextResponse.json({ approval });
  }

  if (body.intent === "reject") {
    const claimed = await claimApprovalRejection(body.id, auth.user.id);
    if (!claimed) {
      const existing = await getApproval(body.id);
      if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ error: `Already ${existing.status}` }, { status: 409 });
    }
    await audit({
      action: "approval:reject",
      target: body.id,
      approved: false,
      actorId: auth.user.id,
      actorEmail: auth.user.email,
    });
    return NextResponse.json({ approval: claimed });
  }

  if (body.intent === "approve") {
    const claimed = await claimApprovalForExecution(body.id, auth.user.id);
    if (!claimed) {
      const existing = await getApproval(body.id);
      if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (existing.status === "executed") {
        return NextResponse.json({ approval: existing, result: { ok: true, detail: existing.result ?? "Already executed" } });
      }
      return NextResponse.json({ error: `Already ${existing.status}` }, { status: 409 });
    }
    const cfg = getConfig();
    if (claimed.safety.blocked) {
      await setApprovalStatus(body.id, "rejected", claimed.safety.reason, auth.user.id);
      return NextResponse.json({ error: claimed.safety.reason }, { status: 403 });
    }
    if (cfg.readOnly) {
      await setApprovalStatus(body.id, "failed", "Read-only mode blocked execution", auth.user.id);
      return NextResponse.json({ error: "Read-only mode enabled." }, { status: 403 });
    }
    try {
      const result = await executeAction(claimed.action, { approved: true, approvalId: body.id });
      const updated = await setApprovalStatus(
        body.id,
        result.ok ? "executed" : "failed",
        result.detail,
        auth.user.id
      );
      await audit({
        action: "approval:approve",
        target: body.id,
        approved: true,
        actorId: auth.user.id,
        actorEmail: auth.user.email,
        details: result.detail.slice(0, 200),
      });
      return NextResponse.json({ approval: updated, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Execution failed";
      await setApprovalStatus(body.id, "failed", message, auth.user.id);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown intent" }, { status: 400 });
}

function previewTarget(action: ApprovalAction): string {
  switch (action.type) {
    case "ticket-comment":
      return action.ref;
    case "zendesk-create":
      return action.subject;
    case "slack-message":
      return action.channel;
    case "jira-transition":
      return action.ref;
    case "jira-link":
      return `${action.from}->${action.to}`;
    case "jira-create":
      return action.projectKey;
    case "api-call":
      return action.url;
    case "mcp-call":
      return `${action.server}:${action.tool}`;
    case "build-app-scaffold":
    case "build-app-write":
    case "build-app-deploy":
    case "build-app-git-commit":
      return action.projectId;
  }
}
