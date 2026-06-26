import "server-only";

import type { ChatStreamEvent } from "@/lib/support/chat/stream-events";
import { simulateStream } from "@/lib/support/openai-stream";
import {
  handleBuildAppPlan,
  handleBuildAppDeploy,
  requestScaffoldApproval,
  requestWriteApproval,
  requestDeployApproval,
} from "./orchestrate";
import { isDeployRequest } from "./classify-request";
import type { DeploymentTarget } from "./types";

type SendFn = (event: ChatStreamEvent) => void;

export interface BuildAppChatStreamResult {
  fullText: string;
  projectId?: string;
  approvalId?: string;
}

export async function streamBuildAppFromChat(input: {
  message: string;
  projectId?: string;
  messageId: string;
  send: SendFn;
}): Promise<BuildAppChatStreamResult> {
  const { message, projectId, messageId, send } = input;
  let fullText = "";

  if (projectId && isDeployRequest(message)) {
    const target: DeploymentTarget = /\bprod(uction)?\b/i.test(message) ? "production" : "preview";
    const planToolId = crypto.randomUUID();
    send({
      type: "tool_call_start",
      toolCallId: planToolId,
      agent: "appDeploy",
      name: "deployment_plan",
      summary: "Checking Vercel readiness and running build…",
    });

    const deployPlan = await handleBuildAppDeploy(projectId, target);
    fullText = [
      deployPlan.explanation,
      "",
      deployPlan.buildOk === false
        ? "Fix build errors before deploying."
        : "Approve deployment when ready — I'll use the Deployments panel approval queue.",
    ].join("\n");

    send({ type: "tool_call_update", toolCallId: planToolId, status: "running" });
    for await (const chunk of simulateStream(fullText)) {
      send({ type: "token", messageId, text: chunk });
    }

    const approval = requestDeployApproval(projectId, target, deployPlan.explanation);
    send({
      type: "approval_required",
      approvalId: approval.id,
      action: { type: "build-app-deploy", projectId, target },
    });

    send({
      type: "tool_call_result",
      toolCallId: planToolId,
      status: deployPlan.buildOk === false ? "error" : "success",
      summary: deployPlan.buildOk ? "Build passed — deployment awaiting approval" : "Build failed",
    });

    send({
      type: "build_app_updated",
      projectId,
      patch: { status: deployPlan.buildOk ? "ready" : "failed" },
    });

    return { fullText, projectId, approvalId: approval.id };
  }

  const planToolId = crypto.randomUUID();
  send({
    type: "tool_call_start",
    toolCallId: planToolId,
    agent: "appBuilder",
    name: projectId ? "propose_edit" : "plan_app",
    summary: projectId
      ? "Proposing app changes from your request…"
      : "Planning Cyware app from your description…",
  });

  const result = handleBuildAppPlan({ message, projectId });
  const pid = result.project?.id;

  if (!pid) {
    send({
      type: "tool_call_result",
      toolCallId: planToolId,
      status: "error",
      summary: "Could not create app plan",
    });
    fullText = result.explanation || "Could not create an app plan.";
    for await (const chunk of simulateStream(fullText)) {
      send({ type: "token", messageId, text: chunk });
    }
    return { fullText };
  }

  let approvalId: string | undefined;
  if (result.needsApproval && result.pendingChanges?.length) {
    const approval =
      projectId && result.pendingChanges.some((c) => c.action === "update")
        ? requestWriteApproval(
            pid,
            result.pendingChanges.map((c) => c.path),
            result.approvalPreview ?? "Apply app edits"
          )
        : requestScaffoldApproval(pid, result.approvalPreview ?? `Scaffold ${result.pendingChanges.length} files`);
    approvalId = approval.id;
    send({
      type: "approval_required",
      approvalId: approval.id,
      action: approval.action,
    });
  }

  send({
    type: "build_app_created",
    projectId: pid,
    title: result.plan.title,
    templateId: result.plan.templateId,
    approvalId,
    fileCount: result.pendingChanges?.length ?? 0,
  });

  fullText = [
    result.explanation,
    "",
    approvalId
      ? `**Next step:** Open the Build App workspace to review ${result.pendingChanges?.length ?? 0} file diff(s), then approve the scaffold/write action (approval \`${approvalId.slice(0, 8)}…\`).`
      : "",
    result.plan.clarifyingQuestions.length
      ? `\nOptional:\n${result.plan.clarifyingQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  send({ type: "tool_call_update", toolCallId: planToolId, status: "running" });
  for await (const chunk of simulateStream(fullText)) {
    send({ type: "token", messageId, text: chunk });
  }

  send({
    type: "tool_call_result",
    toolCallId: planToolId,
    status: "success",
    summary: projectId
      ? `Proposed edits for ${result.project?.name ?? "app"}`
      : `Planned ${result.plan.templateId} (${result.pendingChanges?.length ?? 0} files)`,
  });

  return { fullText, projectId: pid, approvalId };
}
