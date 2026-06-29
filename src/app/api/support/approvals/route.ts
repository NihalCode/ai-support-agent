import { NextResponse } from "next/server";
import {
  enqueueApproval,
  getApproval,
  listApprovals,
  setApprovalStatus,
} from "@/lib/support/approvals";
import { classifyAction } from "@/lib/support/safety";
import { executeAction } from "@/lib/support/executor";
import { getConfig } from "@/lib/support/config";
import { audit } from "@/lib/support/audit";
import { postSlackMessage } from "@/lib/support/slack/client";
import { buildApprovalBlocks } from "@/lib/support/slack/approval-cards";
import type { ApprovalAction, ApprovalStatus, PlannedAction } from "@/lib/support/types";

export const runtime = "nodejs";

/**
 * Approval queue API.
 *   GET  ?status=pending           → list approval requests
 *   POST {intent:"create", action, planned, preview} → classify + enqueue
 *   POST {intent:"approve", id}    → execute the queued action (if allowed)
 *   POST {intent:"reject",  id}    → mark rejected
 */
export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get("status") as ApprovalStatus | null;
  return NextResponse.json({ approvals: listApprovals(status ?? undefined) });
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
  let body: CreateBody | DecisionBody;
  try {
    body = (await req.json()) as CreateBody | DecisionBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.intent === "create") {
    const safety = classifyAction(body.planned);
    const approval = enqueueApproval({ action: body.action, safety, preview: body.preview });
    await audit({
      action: `approval:create:${body.action.type}`,
      target: previewTarget(body.action),
      approved: false,
      safetyClass: safety.safetyClass,
      details: safety.reason,
    });
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
    const updated = setApprovalStatus(body.id, "rejected");
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await audit({ action: "approval:reject", target: body.id, approved: false });
    return NextResponse.json({ approval: updated });
  }

  if (body.intent === "approve") {
    const req0 = getApproval(body.id);
    if (!req0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (req0.status !== "pending") {
      return NextResponse.json({ error: `Already ${req0.status}` }, { status: 409 });
    }
    const cfg = getConfig();
    if (req0.safety.blocked) {
      setApprovalStatus(body.id, "rejected", req0.safety.reason);
      return NextResponse.json({ error: req0.safety.reason }, { status: 403 });
    }
    if (cfg.readOnly) {
      return NextResponse.json({ error: "Read-only mode enabled." }, { status: 403 });
    }
    try {
      const result = await executeAction(req0.action, { approved: true });
      const updated = setApprovalStatus(body.id, result.ok ? "executed" : "failed", result.detail);
      return NextResponse.json({ approval: updated, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Execution failed";
      setApprovalStatus(body.id, "failed", message);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown intent" }, { status: 400 });
}

function previewTarget(action: ApprovalAction): string {
  switch (action.type) {
    case "ticket-comment":
      return action.ref;
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
