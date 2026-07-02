import "server-only";

import { NextResponse } from "next/server";

import { enqueueApproval } from "@/lib/support/approvals";
import { audit } from "@/lib/support/enterprise/audit-log";
import { upsertInvestigationLinks } from "@/lib/support/enterprise/stores/investigation-links-store";
import { ingestEnterpriseKnowledge } from "@/lib/support/enterprise/knowledge-ingest";
import {
  listKnowledgeSources,
  upsertKnowledgeSource,
} from "@/lib/support/enterprise/stores/knowledge-source-store";
import type { ApprovalAction } from "@/lib/support/types";
import { isTestMode } from "@/lib/test-mode";
import { searchConfluencePages, getConfluencePage } from "@/integrations/confluence/ConfluenceConnector";
import { tryAcquireConfluenceSyncLock, releaseConfluenceSyncLock } from "@/integrations/confluence/sync-lock";
import { searchJiraIssues, getJiraIssue } from "@/integrations/jira/JiraConnector";
import { sendSlackTestMessage } from "@/integrations/slack/SlackConnector";
import { searchZendeskTickets, getZendeskTicket } from "@/integrations/zendesk/ZendeskConnector";
import { getJiraTickets, getZendeskTickets } from "@/lib/support/connectors";

export async function handleSlackTestMessage(channel: string, text: string) {
  return sendSlackTestMessage(channel, text);
}

export async function handleConfluenceSearch(query: string, limit = 10) {
  const pages = await searchConfluencePages(query, limit);
  await audit({ action: "read:confluence-search", approved: true, provider: "confluence", details: query });
  return { pages };
}

export async function handleConfluenceRead(pageId: string) {
  const page = await getConfluencePage(pageId);
  await audit({ action: "read:confluence-page", target: pageId, approved: true, provider: "confluence" });
  return { page };
}

export async function handleConfluenceSync(userId: string, spaceKey?: string) {
  if (!tryAcquireConfluenceSyncLock()) {
    return { skipped: true, reason: "A Confluence sync is already running." };
  }

  try {
    const name = `Confluence ${spaceKey ?? "default"}`;
    const source = await upsertKnowledgeSource({
      type: "confluence",
      name,
      externalId: spaceKey,
      status: "syncing",
      createdByUserId: userId,
    });

    try {
      const result = await ingestEnterpriseKnowledge();
      const updated = await upsertKnowledgeSource({
        id: source.id,
        type: "confluence",
        name,
        status: result.upserted > 0 ? "indexed" : "failed",
        lastSyncedAt: new Date().toISOString(),
      });
      await audit({
        action: "knowledge:sync",
        target: source.id,
        approved: true,
        provider: "confluence",
        actorId: userId,
        details: `upserted ${result.upserted} chunks`,
      });
      return { source: updated, result };
    } catch (err) {
      await upsertKnowledgeSource({ id: source.id, type: "confluence", name, status: "failed" });
      throw err;
    }
  } finally {
    releaseConfluenceSyncLock();
  }
}

export async function handleConfluenceSources() {
  const sources = await listKnowledgeSources();
  return { sources: sources.filter((s) => s.type === "confluence") };
}

export async function handleZendeskSearch(query: string, limit = 10) {
  const tickets = await searchZendeskTickets(query, limit);
  await audit({ action: "read:zendesk-search", approved: true, provider: "zendesk", details: query });
  return { tickets };
}

export async function handleZendeskRead(ticketId: string) {
  const ticket = await getZendeskTicket(ticketId);
  await audit({ action: "read:zendesk-ticket", target: ticketId, approved: true, provider: "zendesk" });
  return { ticket };
}

export async function handleZendeskLink(investigationId: string, ticketId: string, userId: string) {
  const links = await upsertInvestigationLinks(investigationId, {
    zendeskTicketId: ticketId,
    sourceSystem: "zendesk",
    createdByUserId: userId,
  });
  await audit({
    action: "investigation:link-zendesk",
    target: ticketId,
    approved: true,
    provider: "zendesk",
    actorId: userId,
    details: investigationId,
  });
  return { links };
}

export async function handleZendeskWriteRequest(
  userId: string,
  action: Extract<ApprovalAction, { type: "ticket-comment" | "zendesk-create" }>,
  preview: string
) {
  const approval = await enqueueApproval({
    action,
    safety: {
      safetyClass: action.type === "zendesk-create" ? "WRITE_MEDIUM_RISK" : action.public ? "WRITE_MEDIUM_RISK" : "WRITE_LOW_RISK",
      requiresApproval: true,
      blocked: false,
      reason: "External write requires approval",
    },
    preview,
    requestedByUserId: userId,
  });
  await audit({
    action: `request:${action.type}`,
    target: "ref" in action ? action.ref : action.subject,
    approved: false,
    provider: "zendesk",
    actorId: userId,
    details: approval.id,
  });
  return { approvalId: approval.id, status: "pending" };
}

export async function handleJiraSearch(query: string, limit = 10) {
  const issues = await searchJiraIssues(query, limit);
  await audit({ action: "read:jira-search", approved: true, provider: "jira", details: query });
  return { issues };
}

export async function handleJiraRead(issueKey: string) {
  const issue = await getJiraIssue(issueKey);
  await audit({ action: "read:jira-issue", target: issueKey, approved: true, provider: "jira" });
  return { issue };
}

export async function handleJiraLink(investigationId: string, issueKey: string, userId: string) {
  const links = await upsertInvestigationLinks(investigationId, {
    jiraIssueKey: issueKey,
    sourceSystem: "jira",
    createdByUserId: userId,
  });
  await audit({
    action: "investigation:link-jira",
    target: issueKey,
    approved: true,
    provider: "jira",
    actorId: userId,
    details: investigationId,
  });
  return { links };
}

export async function handleJiraWriteRequest(
  userId: string,
  action: Extract<
    ApprovalAction,
    { type: "jira-create" | "ticket-comment" | "jira-transition" | "jira-link" }
  >,
  preview: string
) {
  const approval = await enqueueApproval({
    action,
    safety: {
      safetyClass: "WRITE_MEDIUM_RISK",
      requiresApproval: true,
      blocked: false,
      reason: "Jira write requires approval",
    },
    preview,
    requestedByUserId: userId,
  });
  await audit({
    action: `request:${action.type}`,
    target: "ref" in action ? action.ref : "projectKey" in action ? action.projectKey : undefined,
    approved: false,
    provider: "jira",
    actorId: userId,
    details: approval.id,
  });
  return { approvalId: approval.id, status: "pending" };
}

export async function handleJiraCreateDraft(input: {
  summary: string;
  description: string;
  projectKey?: string;
}) {
  const { connector, mock } = await getJiraTickets();
  const projectKey = input.projectKey ?? "SUP";
  return {
    draft: {
      summary: input.summary,
      description: input.description,
      projectKey,
      issueType: "Task",
    },
    mock,
    connector: connector.id,
  };
}

export async function handleZendeskCreateDraft(input: { subject: string; body: string }) {
  const { connector, mock } = await getZendeskTickets();
  return { draft: input, mock, connector: connector.id };
}

export function integrationErrorResponse(err: unknown, status = 400): NextResponse {
  const message = err instanceof Error ? err.message : "Request failed";
  return NextResponse.json({ error: message }, { status });
}

export function mockOnlyResponse(): NextResponse | null {
  if (isTestMode()) return null;
  return null;
}
