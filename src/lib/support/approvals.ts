import "server-only";

import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  ApprovalAction,
  ApprovalRequest,
  ApprovalStatus,
  SafetyVerdict,
} from "./types";
import { redact } from "./redact";
import { supportDataRoot } from "./data-root";

/**
 * Approval queue with in-memory cache + disk persistence for serverless (Vercel).
 * Survives cold starts and cross-request lookups within the same deployment region.
 */

const g = globalThis as unknown as { __approvalQueue?: Map<string, ApprovalRequest> };
const queue: Map<string, ApprovalRequest> = (g.__approvalQueue ??= new Map());

const MAX_ENTRIES = 200;

function approvalsDir(): string {
  return supportDataRoot("approvals");
}

function approvalPath(id: string): string {
  return path.join(approvalsDir(), `${id}.json`);
}

function persistApproval(req: ApprovalRequest): void {
  writeFileSync(approvalPath(req.id), JSON.stringify(req, null, 2));
  queue.set(req.id, req);
}

function loadFromDisk(id: string): ApprovalRequest | null {
  const file = approvalPath(id);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as ApprovalRequest;
  } catch {
    return null;
  }
}

function hydrateQueueFromDisk(): void {
  if (!existsSync(approvalsDir())) return;
  for (const name of readdirSync(approvalsDir())) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -5);
    if (queue.has(id)) continue;
    const loaded = loadFromDisk(id);
    if (loaded) queue.set(id, loaded);
  }
}

function prune() {
  hydrateQueueFromDisk();
  if (queue.size <= MAX_ENTRIES) return;
  const sorted = [...queue.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const entry of sorted.slice(0, queue.size - MAX_ENTRIES)) {
    queue.delete(entry.id);
    try {
      unlinkSync(approvalPath(entry.id));
    } catch {
      /* ignore */
    }
  }
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
  persistApproval(req);
  prune();
  return req;
}

export function getApproval(id: string): ApprovalRequest | null {
  const mem = queue.get(id);
  if (mem) return mem;
  const disk = loadFromDisk(id);
  if (disk) queue.set(id, disk);
  return disk;
}

export function listApprovals(status?: ApprovalStatus): ApprovalRequest[] {
  hydrateQueueFromDisk();
  const all = [...queue.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return status ? all.filter((r) => r.status === status) : all;
}

export function setApprovalStatus(
  id: string,
  status: ApprovalStatus,
  result?: string
): ApprovalRequest | null {
  let req = queue.get(id) ?? loadFromDisk(id);
  if (!req) return null;
  req.status = status;
  req.resolvedAt = new Date().toISOString();
  if (result !== undefined) req.result = redact(result);
  persistApproval(req);
  return req;
}
