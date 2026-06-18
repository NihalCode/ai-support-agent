import "server-only";

import { randomUUID } from "node:crypto";
import type {
  ApprovalAction,
  ApprovalRequest,
  ApprovalStatus,
  SafetyVerdict,
} from "./types";
import { redact } from "./redact";

/**
 * In-memory approval queue (offline-first). Survives across requests within a
 * single server process via a global. When DATABASE_URL/REDIS_URL are set this
 * is where a durable adapter would plug in; the public API stays the same.
 */

const g = globalThis as unknown as { __approvalQueue?: Map<string, ApprovalRequest> };
const queue: Map<string, ApprovalRequest> = (g.__approvalQueue ??= new Map());

const MAX_ENTRIES = 200;

function prune() {
  if (queue.size <= MAX_ENTRIES) return;
  const sorted = [...queue.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const entry of sorted.slice(0, queue.size - MAX_ENTRIES)) queue.delete(entry.id);
}

export function enqueueApproval(input: {
  action: ApprovalAction;
  safety: SafetyVerdict;
  preview: string;
}): ApprovalRequest {
  const req: ApprovalRequest = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    status: "pending",
    action: input.action,
    safety: input.safety,
    preview: redact(input.preview),
  };
  queue.set(req.id, req);
  prune();
  return req;
}

export function getApproval(id: string): ApprovalRequest | null {
  return queue.get(id) ?? null;
}

export function listApprovals(status?: ApprovalStatus): ApprovalRequest[] {
  const all = [...queue.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return status ? all.filter((r) => r.status === status) : all;
}

export function setApprovalStatus(
  id: string,
  status: ApprovalStatus,
  result?: string
): ApprovalRequest | null {
  const req = queue.get(id);
  if (!req) return null;
  req.status = status;
  req.resolvedAt = new Date().toISOString();
  if (result !== undefined) req.result = redact(result);
  queue.set(id, req);
  return req;
}
