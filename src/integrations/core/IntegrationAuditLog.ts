import "server-only";

import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

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

export class IntegrationAuditLog {
  static async append(entry: Omit<IntegrationAuditEntry, "id" | "at">): Promise<void> {
    await mkdir(DATA_DIR, { recursive: true });
    const row: IntegrationAuditEntry = {
      ...entry,
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
    };
    await appendFile(LOG_FILE, `${JSON.stringify(row)}\n`, "utf8");
  }

  static async recent(limit = 50): Promise<IntegrationAuditEntry[]> {
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
