import "server-only";

import type { ApprovalAction, ApprovalRequest, ApprovalStatus, SafetyVerdict } from "../../types";
import { redact } from "../../redact";
import { pgQuery, isPostgresConfigured } from "@/lib/db/postgres";
import {
  DEFAULT_WORKSPACE_ID,
  type ApprovalActionType,
  type ApprovalTargetSystem,
  type EnterpriseApprovalRequest,
  type RiskLevel,
} from "../types";
import {
  defaultOrgId,
  enterpriseDataDir,
  readJsonArrayFile,
  writeJsonArrayFile,
} from "../file-store";

const MAX_ENTRIES = 500;

function approvalsFile(): string {
  return `${enterpriseDataDir("approvals")}/requests.json`;
}

function rowToApproval(row: Record<string, unknown>): EnterpriseApprovalRequest {
  return {
    id: String(row.id),
    requestedByUserId: String(row.requested_by_user_id ?? "system"),
    approvedByUserId: row.approved_by_user_id ? String(row.approved_by_user_id) : undefined,
    actionType: String(row.action_type) as ApprovalActionType,
    targetSystem: String(row.target_system) as ApprovalTargetSystem,
    targetId: row.target_id ? String(row.target_id) : undefined,
    riskLevel: String(row.risk_level ?? "medium") as RiskLevel,
    summary: String(row.summary ?? ""),
    payloadPreview: (row.payload_preview as Record<string, unknown>) ?? {},
    status: String(row.status) as ApprovalStatus,
    action: row.action_json as ApprovalAction,
    safety: row.safety_json as SafetyVerdict,
    preview: String(row.preview ?? ""),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at ?? row.created_at)).toISOString(),
    resolvedAt: row.resolved_at ? new Date(String(row.resolved_at)).toISOString() : undefined,
    result: row.result ? String(row.result) : undefined,
  };
}

export function classifyApprovalMeta(action: ApprovalAction, safety: SafetyVerdict): {
  actionType: ApprovalActionType;
  targetSystem: ApprovalTargetSystem;
  targetId?: string;
  riskLevel: RiskLevel;
  summary: string;
} {
  switch (action.type) {
    case "jira-create":
      return {
        actionType: "create_jira_issue",
        targetSystem: "jira",
        targetId: action.projectKey,
        riskLevel: "medium",
        summary: `Create Jira issue in ${action.projectKey}`,
      };
    case "jira-transition":
      return {
        actionType: "update_jira_issue",
        targetSystem: "jira",
        targetId: action.ref,
        riskLevel: "medium",
        summary: `Transition ${action.ref} → ${action.transition}`,
      };
    case "jira-link":
      return {
        actionType: "update_jira_issue",
        targetSystem: "jira",
        targetId: action.from,
        riskLevel: "high",
        summary: `Link ${action.from} ${action.linkType} ${action.to}`,
      };
    case "ticket-comment":
      if (action.provider === "zendesk") {
        return {
          actionType: action.public ? "send_zendesk_reply" : "add_zendesk_internal_note",
          targetSystem: "zendesk",
          targetId: action.ref,
          riskLevel: action.public ? "medium" : "low",
          summary: `${action.public ? "Public reply" : "Internal note"} on ${action.ref}`,
        };
      }
      return {
        actionType: "comment_jira_issue",
        targetSystem: action.provider === "jira" ? "jira" : "app",
        targetId: action.ref,
        riskLevel: "low",
        summary: `Comment on ${action.ref}`,
      };
    case "zendesk-create":
      return {
        actionType: "create_zendesk_ticket",
        targetSystem: "zendesk",
        riskLevel: "medium",
        summary: `Create Zendesk ticket: ${action.subject}`,
      };
    case "slack-message":
      return {
        actionType: "send_slack_message",
        targetSystem: "slack",
        targetId: action.channel,
        riskLevel: "medium",
        summary: `Send Slack message to ${action.channel}`,
      };
    case "build-app-deploy":
      return {
        actionType: "deploy_app",
        targetSystem: "vercel",
        targetId: action.projectId,
        riskLevel: "high",
        summary: `Deploy ${action.projectId} (${action.target})`,
      };
    case "api-call":
      return {
        actionType: "run_real_api_call",
        targetSystem: "cyware_api",
        targetId: action.url,
        riskLevel: safety.safetyClass === "WRITE_HIGH_RISK" ? "high" : "medium",
        summary: `${action.method} ${action.url}`,
      };
    default:
      return {
        actionType: "run_terminal_command",
        targetSystem: "app",
        riskLevel: safety.safetyClass === "WRITE_HIGH_RISK" ? "high" : "medium",
        summary: action.type,
      };
  }
}

export async function saveApproval(
  req: EnterpriseApprovalRequest
): Promise<EnterpriseApprovalRequest> {
  if (isPostgresConfigured()) {
    await pgQuery`
      INSERT INTO approval_requests (
        id, org_id, requested_by_user_id, approved_by_user_id, action_type, target_system,
        target_id, risk_level, summary, payload_preview, status, action_json, safety_json,
        preview, result, created_at, updated_at, resolved_at
      ) VALUES (
        ${req.id}, ${DEFAULT_WORKSPACE_ID}, ${req.requestedByUserId}, ${req.approvedByUserId ?? null},
        ${req.actionType}, ${req.targetSystem}, ${req.targetId ?? null}, ${req.riskLevel},
        ${req.summary}, ${JSON.stringify(req.payloadPreview)}, ${req.status},
        ${JSON.stringify(req.action)}, ${JSON.stringify(req.safety)}, ${req.preview},
        ${req.result ?? null}, ${req.createdAt}, ${req.updatedAt}, ${req.resolvedAt ?? null}
      )
      ON CONFLICT (id) DO UPDATE SET
        approved_by_user_id = EXCLUDED.approved_by_user_id,
        status = EXCLUDED.status,
        result = EXCLUDED.result,
        updated_at = EXCLUDED.updated_at,
        resolved_at = EXCLUDED.resolved_at
    `;
    return req;
  }

  const all = readJsonArrayFile<EnterpriseApprovalRequest>(approvalsFile());
  const idx = all.findIndex((a) => a.id === req.id);
  if (idx >= 0) all[idx] = req;
  else all.unshift(req);
  writeJsonArrayFile(approvalsFile(), all.slice(0, MAX_ENTRIES));
  return req;
}

export async function fetchApproval(id: string): Promise<EnterpriseApprovalRequest | null> {
  if (isPostgresConfigured()) {
    const rows = await pgQuery`
      SELECT * FROM approval_requests WHERE id = ${id} AND org_id = ${defaultOrgId()} LIMIT 1
    `;
    return rows[0] ? rowToApproval(rows[0]) : null;
  }
  return readJsonArrayFile<EnterpriseApprovalRequest>(approvalsFile()).find((a) => a.id === id) ?? null;
}

export async function fetchApprovals(
  status?: ApprovalStatus
): Promise<EnterpriseApprovalRequest[]> {
  if (isPostgresConfigured()) {
    const rows = status
      ? await pgQuery`
          SELECT * FROM approval_requests
          WHERE org_id = ${defaultOrgId()} AND status = ${status}
          ORDER BY created_at DESC LIMIT ${MAX_ENTRIES}
        `
      : await pgQuery`
          SELECT * FROM approval_requests
          WHERE org_id = ${defaultOrgId()}
          ORDER BY created_at DESC LIMIT ${MAX_ENTRIES}
        `;
    return rows.map(rowToApproval);
  }
  const all = readJsonArrayFile<EnterpriseApprovalRequest>(approvalsFile());
  return (status ? all.filter((a) => a.status === status) : all).slice(0, MAX_ENTRIES);
}

export function toLegacyApproval(req: EnterpriseApprovalRequest): ApprovalRequest {
  return {
    id: req.id,
    createdAt: req.createdAt,
    status: req.status,
    action: req.action,
    safety: req.safety,
    preview: req.preview,
    resolvedAt: req.resolvedAt,
    result: req.result,
  };
}

export function buildPayloadPreview(action: ApprovalAction): Record<string, unknown> {
  const copy = { ...action } as Record<string, unknown>;
  if (typeof copy.body === "string") copy.body = redact(copy.body);
  if (typeof copy.text === "string") copy.text = redact(copy.text);
  if (typeof copy.description === "string") copy.description = redact(copy.description);
  return copy;
}
