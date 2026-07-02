import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { isPostgresConfigured, pgQuery } from "@/lib/db/postgres";
import type { IntegrationId } from "./IntegrationTypes";
import type { IntegrationHealthResult } from "./EnterpriseConnector";

export interface IntegrationHealthCheckRecord {
  id: string;
  integrationId: string;
  orgId: string;
  status: "success" | "error";
  message: string;
  checkedAt: string;
}

const FILE = path.join(process.cwd(), ".data", "enterprise", "integration-health.json");

async function readFileStore(): Promise<IntegrationHealthCheckRecord[]> {
  try {
    const raw = await readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as { records?: IntegrationHealthCheckRecord[] };
    return Array.isArray(parsed.records) ? parsed.records : [];
  } catch {
    return [];
  }
}

async function writeFileStore(records: IntegrationHealthCheckRecord[]): Promise<void> {
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify({ records }, null, 2), "utf8");
}

export class IntegrationHealthService {
  static async record(
    orgId: string,
    integrationId: IntegrationId,
    result: IntegrationHealthResult
  ): Promise<IntegrationHealthCheckRecord> {
    const entry: IntegrationHealthCheckRecord = {
      id: randomUUID(),
      integrationId,
      orgId,
      status: result.status,
      message: result.message,
      checkedAt: result.checkedAt,
    };

    if (isPostgresConfigured()) {
      await pgQuery`
        INSERT INTO integration_health_checks (id, integration_id, org_id, status, message, checked_at)
        VALUES (${entry.id}, ${integrationId}, ${orgId}, ${entry.status}, ${entry.message}, ${entry.checkedAt}::timestamptz)
      `;
      return entry;
    }

    const records = await readFileStore();
    records.unshift(entry);
    await writeFileStore(records.slice(0, 200));
    return entry;
  }

  static async latest(
    orgId: string,
    integrationId: IntegrationId
  ): Promise<IntegrationHealthCheckRecord | null> {
    if (isPostgresConfigured()) {
      const rows = await pgQuery`
        SELECT id, integration_id, org_id, status, message, checked_at
        FROM integration_health_checks
        WHERE org_id = ${orgId} AND integration_id = ${integrationId}
        ORDER BY checked_at DESC
        LIMIT 1
      `;
      if (!rows[0]) return null;
      const row = rows[0];
      return {
        id: String(row.id),
        integrationId: String(row.integration_id),
        orgId: String(row.org_id),
        status: String(row.status) as "success" | "error",
        message: String(row.message),
        checkedAt: new Date(String(row.checked_at)).toISOString(),
      };
    }
    return (
      (await readFileStore()).find(
        (r) => r.orgId === orgId && r.integrationId === integrationId
      ) ?? null
    );
  }
}
