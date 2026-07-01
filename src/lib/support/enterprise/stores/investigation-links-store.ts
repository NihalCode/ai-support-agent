import "server-only";

import { pgQuery, isPostgresConfigured } from "@/lib/db/postgres";
import type { InvestigationLinks, InvestigationSourceSystem } from "../types";
import {
  defaultOrgId,
  enterpriseDataDir,
  readJsonFile,
  writeJsonFile,
} from "../file-store";

function linksFile(): string {
  return `${enterpriseDataDir("investigations")}/links.json`;
}

function rowToLinks(row: Record<string, unknown>): InvestigationLinks {
  return {
    investigationId: String(row.investigation_id),
    sourceSystem: row.source_system
      ? (String(row.source_system) as InvestigationSourceSystem)
      : undefined,
    zendeskTicketId: row.zendesk_ticket_id ? String(row.zendesk_ticket_id) : undefined,
    jiraIssueKey: row.jira_issue_key ? String(row.jira_issue_key) : undefined,
    slackThreadId: row.slack_thread_id ? String(row.slack_thread_id) : undefined,
    confluenceSourceIds: Array.isArray(row.confluence_source_ids)
      ? (row.confluence_source_ids as string[])
      : undefined,
    customerSummary: row.customer_summary ? String(row.customer_summary) : undefined,
    developerHandoff: row.developer_handoff ? String(row.developer_handoff) : undefined,
    customerResponse: row.customer_response ? String(row.customer_response) : undefined,
    rootCause: row.root_cause ? String(row.root_cause) : undefined,
    confidence: row.confidence
      ? (String(row.confidence) as InvestigationLinks["confidence"])
      : undefined,
    assignedToUserId: row.assigned_to_user_id ? String(row.assigned_to_user_id) : undefined,
    createdByUserId: String(row.created_by_user_id ?? "system"),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function readAllFile(): Record<string, InvestigationLinks> {
  return readJsonFile<Record<string, InvestigationLinks>>(linksFile(), {});
}

function writeAllFile(data: Record<string, InvestigationLinks>): void {
  writeJsonFile(linksFile(), data);
}

export async function getInvestigationLinks(
  investigationId: string
): Promise<InvestigationLinks | null> {
  if (isPostgresConfigured()) {
    const rows = await pgQuery`
      SELECT * FROM investigation_links
      WHERE investigation_id = ${investigationId} AND org_id = ${defaultOrgId()} LIMIT 1
    `;
    return rows[0] ? rowToLinks(rows[0]) : null;
  }
  return readAllFile()[investigationId] ?? null;
}

export async function upsertInvestigationLinks(
  investigationId: string,
  patch: Partial<Omit<InvestigationLinks, "investigationId" | "createdAt">> & {
    createdByUserId?: string;
  }
): Promise<InvestigationLinks> {
  const now = new Date().toISOString();
  const existing = await getInvestigationLinks(investigationId);
  const links: InvestigationLinks = {
    investigationId,
    sourceSystem: patch.sourceSystem ?? existing?.sourceSystem,
    zendeskTicketId: patch.zendeskTicketId ?? existing?.zendeskTicketId,
    jiraIssueKey: patch.jiraIssueKey ?? existing?.jiraIssueKey,
    slackThreadId: patch.slackThreadId ?? existing?.slackThreadId,
    confluenceSourceIds: patch.confluenceSourceIds ?? existing?.confluenceSourceIds,
    customerSummary: patch.customerSummary ?? existing?.customerSummary,
    developerHandoff: patch.developerHandoff ?? existing?.developerHandoff,
    customerResponse: patch.customerResponse ?? existing?.customerResponse,
    rootCause: patch.rootCause ?? existing?.rootCause,
    confidence: patch.confidence ?? existing?.confidence,
    assignedToUserId: patch.assignedToUserId ?? existing?.assignedToUserId,
    createdByUserId: patch.createdByUserId ?? existing?.createdByUserId ?? "system",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  if (isPostgresConfigured()) {
    await pgQuery`
      INSERT INTO investigation_links (
        investigation_id, org_id, source_system, zendesk_ticket_id, jira_issue_key,
        slack_thread_id, confluence_source_ids, customer_summary, developer_handoff,
        customer_response, root_cause, confidence, assigned_to_user_id, created_by_user_id,
        created_at, updated_at
      ) VALUES (
        ${links.investigationId}, ${defaultOrgId()}, ${links.sourceSystem ?? null},
        ${links.zendeskTicketId ?? null}, ${links.jiraIssueKey ?? null},
        ${links.slackThreadId ?? null},
        ${links.confluenceSourceIds ? JSON.stringify(links.confluenceSourceIds) : null},
        ${links.customerSummary ?? null}, ${links.developerHandoff ?? null},
        ${links.customerResponse ?? null}, ${links.rootCause ?? null},
        ${links.confidence ?? null}, ${links.assignedToUserId ?? null},
        ${links.createdByUserId}, ${links.createdAt}, ${links.updatedAt}
      )
      ON CONFLICT (investigation_id) DO UPDATE SET
        source_system = EXCLUDED.source_system,
        zendesk_ticket_id = EXCLUDED.zendesk_ticket_id,
        jira_issue_key = EXCLUDED.jira_issue_key,
        slack_thread_id = EXCLUDED.slack_thread_id,
        confluence_source_ids = EXCLUDED.confluence_source_ids,
        customer_summary = EXCLUDED.customer_summary,
        developer_handoff = EXCLUDED.developer_handoff,
        customer_response = EXCLUDED.customer_response,
        root_cause = EXCLUDED.root_cause,
        confidence = EXCLUDED.confidence,
        assigned_to_user_id = EXCLUDED.assigned_to_user_id,
        updated_at = EXCLUDED.updated_at
    `;
    return links;
  }

  const all = readAllFile();
  all[investigationId] = links;
  writeAllFile(all);
  return links;
}

export async function deleteInvestigationLinks(investigationId: string): Promise<boolean> {
  if (isPostgresConfigured()) {
    await pgQuery`
      DELETE FROM investigation_links
      WHERE investigation_id = ${investigationId} AND org_id = ${defaultOrgId()}
    `;
    return true;
  }
  const all = readAllFile();
  if (!all[investigationId]) return false;
  delete all[investigationId];
  writeAllFile(all);
  return true;
}

export async function listInvestigationLinksByTicket(
  zendeskTicketId: string
): Promise<InvestigationLinks[]> {
  if (isPostgresConfigured()) {
    const rows = await pgQuery`
      SELECT * FROM investigation_links
      WHERE org_id = ${defaultOrgId()} AND zendesk_ticket_id = ${zendeskTicketId}
    `;
    return rows.map(rowToLinks);
  }
  return Object.values(readAllFile()).filter((l) => l.zendeskTicketId === zendeskTicketId);
}
