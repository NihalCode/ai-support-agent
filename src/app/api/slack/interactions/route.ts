import { NextResponse } from "next/server";

import { audit } from "@/lib/support/enterprise/audit-log";
import {
  claimApprovalForExecution,
  claimApprovalRejection,
  getApproval,
  setApprovalStatus,
} from "@/lib/support/approvals";
import { executeAction } from "@/lib/support/executor";
import { postSlackMessage } from "@/lib/support/slack/client";
import { slackSigningSecret } from "@/lib/support/slack/credentials";
import { claimSlackInteraction } from "@/lib/support/slack/event-dedup";
import { verifySlackSignature } from "@/lib/support/slack/signature";
import { isTestMode } from "@/lib/test-mode";

export const runtime = "nodejs";

interface SlackInteractionPayload {
  type: string;
  user?: { id?: string; username?: string; name?: string };
  channel?: { id?: string };
  message?: { ts?: string; thread_ts?: string };
  actions?: { action_id?: string; value?: string }[];
}

async function verify(req: Request, rawBody: string): Promise<NextResponse | null> {
  if (isTestMode()) return null;
  const signingSecret = await slackSigningSecret();
  const verdict = verifySlackSignature({
    signingSecret,
    timestamp: req.headers.get("x-slack-request-timestamp"),
    signature: req.headers.get("x-slack-signature"),
    rawBody,
  });
  if (!verdict.ok) {
    await audit({ action: "slack:interaction-signature", approved: false, details: verdict.reason });
    return NextResponse.json({ error: verdict.reason }, { status: 401 });
  }
  return null;
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const failed = await verify(req, rawBody);
  if (failed) return failed;

  const retryNum = req.headers.get("x-slack-retry-num");
  if (retryNum && Number(retryNum) > 0) {
    return NextResponse.json({ ok: true });
  }

  const params = new URLSearchParams(rawBody);
  const payloadRaw = params.get("payload");
  if (!payloadRaw) return NextResponse.json({ error: "Missing payload" }, { status: 400 });

  let payload: SlackInteractionPayload;
  try {
    payload = JSON.parse(payloadRaw) as SlackInteractionPayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const action = payload.actions?.[0];
  const value = action?.value ?? "";
  const [decision, approvalId] = value.split(":");
  if (!approvalId || (decision !== "approve" && decision !== "reject")) {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  const actionTs = payload.actions?.[0]?.action_id ?? payload.message?.ts ?? "unknown";
  if (
    !(await claimSlackInteraction({
      teamId: (payload as { team?: { id?: string } }).team?.id,
      userId: payload.user?.id,
      actionTs,
      approvalId,
      decision,
    }))
  ) {
    return NextResponse.json({ text: "Already processed." });
  }

  if (decision === "reject") {
    const claimed = await claimApprovalRejection(
      approvalId,
      payload.user?.id,
      `Rejected from Slack by ${payload.user?.id ?? "unknown"}`
    );
    if (!claimed) {
      const existing = await getApproval(approvalId);
      return NextResponse.json({ text: `Approval already ${existing?.status ?? "handled"}.` });
    }
    await audit({
      action: "slack:approval:reject",
      target: approvalId,
      approved: false,
      provider: "slack",
      details: payload.user?.id,
    });
    await maybeReply(payload, `Rejected approval ${approvalId}.`);
    return NextResponse.json({ text: `Rejected ${claimed.action.type ?? "approval"}.` });
  }

  const claimed = await claimApprovalForExecution(approvalId, payload.user?.id);
  if (!claimed) {
    const existing = await getApproval(approvalId);
    if (existing?.status === "executed") {
      return NextResponse.json({ text: `Already executed: ${existing.result ?? "done"}.` });
    }
    return NextResponse.json({ text: `Approval already ${existing?.status ?? "handled"}.` });
  }

  if (claimed.safety.blocked) {
    await setApprovalStatus(approvalId, "rejected", claimed.safety.reason);
    await maybeReply(payload, `Blocked approval ${approvalId}: ${claimed.safety.reason}`);
    return NextResponse.json({ text: claimed.safety.reason });
  }

  try {
    const result = await executeAction(claimed.action, { approved: true, approvalId });
    const updated = await setApprovalStatus(approvalId, result.ok ? "executed" : "failed", result.detail);
    await audit({
      action: "slack:approval:approve",
      target: approvalId,
      approved: true,
      provider: "slack",
      details: `${payload.user?.id ?? "unknown"} → ${result.detail}`,
    });
    await maybeReply(payload, `Executed ${updated?.action.type ?? "approval"}: ${result.detail}`);
    return NextResponse.json({ text: `Executed: ${result.detail}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Execution failed";
    await setApprovalStatus(approvalId, "failed", message);
    await maybeReply(payload, `Approval ${approvalId} failed: ${message}`);
    return NextResponse.json({ text: message }, { status: 500 });
  }
}

async function maybeReply(payload: SlackInteractionPayload, text: string): Promise<void> {
  const channel = payload.channel?.id;
  if (!channel) return;
  await postSlackMessage({
    channel,
    threadTs: payload.message?.thread_ts ?? payload.message?.ts,
    text,
  }).catch(() => undefined);
}
