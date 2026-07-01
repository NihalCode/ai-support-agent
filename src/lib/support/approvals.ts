import "server-only";

import { randomUUID } from "node:crypto";

import type {
  ApprovalAction,
  ApprovalRequest,
  ApprovalStatus,
  SafetyVerdict,
} from "./types";
import { redact } from "./redact";
import type { EnterpriseApprovalRequest } from "./enterprise/types";
import {
  buildPayloadPreview,
  classifyApprovalMeta,
  fetchApproval,
  fetchApprovals,
  saveApproval,
  toLegacyApproval,
} from "./enterprise/stores/approval-store";

const g = globalThis as unknown as { __approvalMem?: Map<string, EnterpriseApprovalRequest> };

function mem(): Map<string, EnterpriseApprovalRequest> {
  if (!g.__approvalMem) g.__approvalMem = new Map();
  return g.__approvalMem;
}

async function hydrateMem(id: string): Promise<EnterpriseApprovalRequest | null> {
  const cached = mem().get(id);
  if (cached) return cached;
  const loaded = await fetchApproval(id);
  if (loaded) mem().set(id, loaded);
  return loaded;
}

export async function enqueueApproval(input: {
  action: ApprovalAction;
  safety: SafetyVerdict;
  preview: string;
  requestedByUserId?: string;
}): Promise<ApprovalRequest> {
  const now = new Date().toISOString();
  const meta = classifyApprovalMeta(input.action, input.safety);
  const req: EnterpriseApprovalRequest = {
    id: randomUUID(),
    requestedByUserId: input.requestedByUserId ?? "system",
    actionType: meta.actionType,
    targetSystem: meta.targetSystem,
    targetId: meta.targetId,
    riskLevel: meta.riskLevel,
    summary: meta.summary,
    payloadPreview: buildPayloadPreview(input.action),
    status: "pending",
    action: input.action,
    safety: input.safety,
    preview: redact(input.preview),
    createdAt: now,
    updatedAt: now,
  };
  await saveApproval(req);
  mem().set(req.id, req);
  return toLegacyApproval(req);
}

export async function getApproval(id: string): Promise<ApprovalRequest | null> {
  const req = await hydrateMem(id);
  return req ? toLegacyApproval(req) : null;
}

export async function getEnterpriseApproval(id: string): Promise<EnterpriseApprovalRequest | null> {
  return hydrateMem(id);
}

export async function listApprovals(status?: ApprovalStatus): Promise<ApprovalRequest[]> {
  const all = await fetchApprovals(status);
  for (const req of all) mem().set(req.id, req);
  return all.map(toLegacyApproval);
}

export async function setApprovalStatus(
  id: string,
  status: ApprovalStatus,
  result?: string,
  approvedByUserId?: string
): Promise<ApprovalRequest | null> {
  const req = await hydrateMem(id);
  if (!req) return null;
  const now = new Date().toISOString();
  req.status = status;
  req.updatedAt = now;
  req.resolvedAt = now;
  if (approvedByUserId) req.approvedByUserId = approvedByUserId;
  if (result !== undefined) req.result = redact(result);
  await saveApproval(req);
  mem().set(id, req);
  return toLegacyApproval(req);
}

export async function assertApprovedForExecution(
  approvalId: string | undefined,
  action: ApprovalAction
): Promise<EnterpriseApprovalRequest> {
  if (!approvalId) {
    throw new Error("Approval request ID is required for this action.");
  }
  const req = await hydrateMem(approvalId);
  if (!req) throw new Error(`Approval request ${approvalId} not found.`);
  if (req.status !== "pending" && req.status !== "approved") {
    throw new Error(`Approval ${approvalId} is ${req.status} and cannot be executed.`);
  }
  if (req.safety.blocked) throw new Error(req.safety.reason);
  if (req.action.type !== action.type) {
    throw new Error("Approval action type does not match the requested execution.");
  }
  return req;
}

/** Sync helpers for legacy callers in hot paths — uses memory cache only. */
export function getApprovalSync(id: string): ApprovalRequest | null {
  const req = mem().get(id);
  return req ? toLegacyApproval(req) : null;
}
