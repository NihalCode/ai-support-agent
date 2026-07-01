import "server-only";

import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { isPostgresConfigured, pgQuery } from "@/lib/db/postgres";
import type { IntegrationId } from "./IntegrationTypes";

export interface IntegrationAuditEntry {
  id: string;
  at: string;
  orgId: string;
  actorId: string;
  actorEmail: string;
  action: "configure" | "delete" | "health_check" | "test";
  integrationId: IntegrationId;
  detail?: string;
}

const DATA_DIR = path.join(process.cwd(), ".data");
const LOG_FILE = path.join(DATA_DIR, "integration-audit.jsonl");

function rowToEntry(row: Record<string, unknown>): IntegrationAuditEntry {
  return {
    id: String(row.id),
    at: new Date(String(row.at)).toISOString(),
    orgId: String(row.org_id ?? row.orgId),
    actorId: String(row.actor_id ?? row.actorId),
    actorEmail: String(row.actor_email ?? row.actorEmail),
    action: row.action as IntegrationAuditEntry["action"],
    integrationId: String(row.integration_id ?? row.integrationId) as IntegrationId,
    detail: row.detail != null ? String(row.detail) : undefined,
  };
}

export class IntegrationAuditLog {
  static async append(entry: Omit<IntegrationAuditEntry, "id" | "at">): Promise<void> {
    const id = crypto.randomUUID();
    const at = new Date().toISOString();

    if (isPostgresConfigured()) {
      await pgQuery`
        INSERT INTO integration_audit_log (
          id, at, org_id, actor_id, actor_email, action, integration_id, detail
        )
        VALUES (
          ${id},
          ${at},
          ${entry.orgId},
          ${entry.actorId},
          ${entry.actorEmail},
          ${entry.action},
          ${entry.integrationId},
          ${entry.detail ?? null}
        )
      `;
      return;
    }

    await mkdir(DATA_DIR, { recursive: true });
    const row: IntegrationAuditEntry = { ...entry, id, at };
    await appendFile(LOG_FILE, `${JSON.stringify(row)}\n`, "utf8");
  }

  static async recent(limit = 50): Promise<IntegrationAuditEntry[]> {
    if (isPostgresConfigured()) {
      const rows = await pgQuery`
        SELECT id, at, org_id, actor_id, actor_email, action, integration_id, detail
        FROM integration_audit_log
        ORDER BY at DESC
        LIMIT ${limit}
      `;
      return rows.map(rowToEntry);
    }

    try {
      const raw = await readFile(LOG_FILE, "utf8");
      const lines = raw.trim().split("\n").filter(Boolean);
      return lines
        .slice(-limit)
        .map((line) => JSON.parse(line) as IntegrationAuditEntry)
        .reverse();
    } catch {
      return [];
    }
  }
}
