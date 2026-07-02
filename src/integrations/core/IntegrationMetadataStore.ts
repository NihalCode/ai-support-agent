import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { isPostgresConfigured, pgQuery } from "@/lib/db/postgres";
import type { IntegrationId } from "./IntegrationTypes";

export type IntegrationRecordStatus = "connected" | "not_connected" | "error" | "disabled";

export interface IntegrationMetadata {
  baseUrl?: string;
  emailMasked?: string;
  defaultProjectKey?: string;
  issueType?: string;
  labels?: string[];
  subdomain?: string;
  spaceKeys?: string[];
  defaultChannelId?: string;
  teamId?: string;
  replyMode?: "draft_only" | "approval_required";
  [key: string]: string | string[] | undefined;
}

export interface IntegrationRecord {
  id: string;
  orgId: string;
  type: IntegrationId;
  name: string;
  status: IntegrationRecordStatus;
  metadata: IntegrationMetadata;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

const FILE = path.join(process.cwd(), ".data", "enterprise", "integrations.json");

async function readFileStore(): Promise<IntegrationRecord[]> {
  try {
    const raw = await readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as { records?: IntegrationRecord[] };
    return Array.isArray(parsed.records) ? parsed.records : [];
  } catch {
    return [];
  }
}

async function writeFileStore(records: IntegrationRecord[]): Promise<void> {
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify({ records }, null, 2), "utf8");
}

function rowToRecord(row: Record<string, unknown>): IntegrationRecord {
  const metadata =
    typeof row.metadata === "string"
      ? (JSON.parse(row.metadata) as IntegrationMetadata)
      : ((row.metadata as IntegrationMetadata) ?? {});
  return {
    id: String(row.id),
    orgId: String(row.org_id ?? row.orgId),
    type: String(row.type) as IntegrationId,
    name: String(row.name),
    status: String(row.status) as IntegrationRecordStatus,
    metadata,
    createdByUserId: String(row.created_by_user_id ?? row.createdByUserId ?? "system"),
    createdAt: new Date(String(row.created_at ?? row.createdAt)).toISOString(),
    updatedAt: new Date(String(row.updated_at ?? row.updatedAt)).toISOString(),
  };
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

export class IntegrationMetadataStore {
  static async get(orgId: string, type: IntegrationId): Promise<IntegrationRecord | null> {
    if (isPostgresConfigured()) {
      const rows = await pgQuery`
        SELECT * FROM integrations WHERE org_id = ${orgId} AND type = ${type} LIMIT 1
      `;
      return rows[0] ? rowToRecord(rows[0]) : null;
    }
    return (await readFileStore()).find((r) => r.orgId === orgId && r.type === type) ?? null;
  }

  static async upsert(input: {
    orgId: string;
    type: IntegrationId;
    name: string;
    status: IntegrationRecordStatus;
    metadata: IntegrationMetadata;
    createdByUserId: string;
  }): Promise<IntegrationRecord> {
    const id = `${input.orgId}:${input.type}`;
    const now = new Date().toISOString();

    if (isPostgresConfigured()) {
      await pgQuery`
        INSERT INTO integrations (id, org_id, type, name, status, metadata, created_by_user_id, created_at, updated_at)
        VALUES (
          ${id}, ${input.orgId}, ${input.type}, ${input.name}, ${input.status},
          ${JSON.stringify(input.metadata)}::jsonb, ${input.createdByUserId}, NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          status = EXCLUDED.status,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
      `;
      const saved = await this.get(input.orgId, input.type);
      if (!saved) throw new Error("Failed to persist integration metadata");
      return saved;
    }

    const records = await readFileStore();
    const existing = records.find((r) => r.orgId === input.orgId && r.type === input.type);
    const record: IntegrationRecord = {
      id,
      orgId: input.orgId,
      type: input.type,
      name: input.name,
      status: input.status,
      metadata: input.metadata,
      createdByUserId: existing?.createdByUserId ?? input.createdByUserId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const next = records.filter((r) => !(r.orgId === input.orgId && r.type === input.type));
    next.push(record);
    await writeFileStore(next);
    return record;
  }

  static async disconnect(orgId: string, type: IntegrationId): Promise<void> {
    if (isPostgresConfigured()) {
      await pgQuery`DELETE FROM integrations WHERE org_id = ${orgId} AND type = ${type}`;
      return;
    }
    const next = (await readFileStore()).filter((r) => !(r.orgId === orgId && r.type === type));
    await writeFileStore(next);
  }
}
