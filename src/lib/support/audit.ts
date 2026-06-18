import "server-only";

import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import type { AuditEntry } from "./types";

/**
 * Append-only audit log of agent actions (especially write attempts). Stored as
 * JSONL in the project root. Best-effort: failures never block the request, and
 * on read-only filesystems we keep an in-memory ring buffer as a fallback.
 */

const LOG_PATH = path.join(process.cwd(), ".audit-log.jsonl");

const g = globalThis as unknown as { __auditMem?: AuditEntry[] };
const mem = (g.__auditMem ??= []);

export async function audit(entry: Omit<AuditEntry, "timestamp">): Promise<void> {
  const full: AuditEntry = { ...entry, timestamp: new Date().toISOString() };
  mem.push(full);
  if (mem.length > 500) mem.shift();
  try {
    await appendFile(LOG_PATH, JSON.stringify(full) + "\n", "utf8");
  } catch {
    // ignore (serverless / read-only FS) — in-memory copy remains
  }
}

export async function readAudit(limit = 100): Promise<AuditEntry[]> {
  try {
    const text = await readFile(LOG_PATH, "utf8");
    const lines = text.trim().split("\n").filter(Boolean);
    const parsed = lines
      .slice(-limit)
      .map((l) => {
        try {
          return JSON.parse(l) as AuditEntry;
        } catch {
          return null;
        }
      })
      .filter((x): x is AuditEntry => x !== null);
    if (parsed.length) return parsed;
  } catch {
    // fall through to memory
  }
  return mem.slice(-limit);
}
