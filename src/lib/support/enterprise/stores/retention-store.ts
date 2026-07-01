import "server-only";

import { pgQuery, isPostgresConfigured } from "@/lib/db/postgres";
import type { RetentionSettings } from "../types";
import { defaultOrgId, enterpriseDataDir, readJsonFile, writeJsonFile } from "../file-store";

function retentionFile(): string {
  return `${enterpriseDataDir("retention")}/settings.json`;
}

function rowToSettings(row: Record<string, unknown>): RetentionSettings {
  return {
    investigationRetentionDays: row.investigation_retention_days
      ? Number(row.investigation_retention_days)
      : undefined,
    slackConversationRetentionDays: row.slack_conversation_retention_days
      ? Number(row.slack_conversation_retention_days)
      : undefined,
    auditLogRetentionDays: row.audit_log_retention_days
      ? Number(row.audit_log_retention_days)
      : undefined,
    knowledgeSourceRefreshDays: row.knowledge_source_refresh_days
      ? Number(row.knowledge_source_refresh_days)
      : undefined,
  };
}

export async function getRetentionSettings(): Promise<RetentionSettings> {
  if (isPostgresConfigured()) {
    const rows = await pgQuery`
      SELECT * FROM retention_settings WHERE org_id = ${defaultOrgId()} LIMIT 1
    `;
    return rows[0] ? rowToSettings(rows[0]) : {};
  }
  return readJsonFile<RetentionSettings>(retentionFile(), {});
}

export async function updateRetentionSettings(
  patch: RetentionSettings
): Promise<RetentionSettings> {
  const current = await getRetentionSettings();
  const next: RetentionSettings = { ...current, ...patch };

  if (isPostgresConfigured()) {
    await pgQuery`
      INSERT INTO retention_settings (
        org_id, investigation_retention_days, slack_conversation_retention_days,
        audit_log_retention_days, knowledge_source_refresh_days, updated_at
      ) VALUES (
        ${defaultOrgId()},
        ${next.investigationRetentionDays ?? null},
        ${next.slackConversationRetentionDays ?? null},
        ${next.auditLogRetentionDays ?? null},
        ${next.knowledgeSourceRefreshDays ?? null},
        ${new Date().toISOString()}
      )
      ON CONFLICT (org_id) DO UPDATE SET
        investigation_retention_days = EXCLUDED.investigation_retention_days,
        slack_conversation_retention_days = EXCLUDED.slack_conversation_retention_days,
        audit_log_retention_days = EXCLUDED.audit_log_retention_days,
        knowledge_source_refresh_days = EXCLUDED.knowledge_source_refresh_days,
        updated_at = EXCLUDED.updated_at
    `;
    return next;
  }

  writeJsonFile(retentionFile(), next);
  return next;
}
