import "server-only";

import { runInvestigation, runInvestigationChat } from "../agents/orchestratorAgent";
import {
  buildSupportQueryFromDetails,
  enrichSupportQuery,
  extractNaturalLanguageDetails,
  isCqlAuthoringRequest,
} from "../investigation/extract-query";
import {
  formatAutoLinkedTicketsNote,
  mergeResolvedTicketLinks,
  resolveTicketsFromContext,
} from "../investigation/ticket-context";
import { formatEvidenceLinksSlack } from "../investigation/evidence-links";
import type { SupportQuery } from "../investigation/types";
import { getSlackThread, setSlackThreadInvestigation } from "./thread-store";
import { upsertInvestigationLinks } from "../enterprise/stores/investigation-links-store";
import { buildCqlSlackReply } from "./cql-reply";

const INVESTIGATION_KEYWORDS =
  /\b(error|fail|bug|issue|ticket|api|endpoint|cql|500|401|403|sync|help|investigate|broken|unauthorized|timeout|ctix|customer|production)\b/i;

async function threadQueryText(channelId: string, threadTs: string, latest: string): Promise<string> {
  const thread = await getSlackThread(channelId, threadTs);
  const parts = (thread?.messages ?? [])
    .filter((m) => m.role === "user")
    .map((m) => m.text.trim())
    .filter(Boolean);
  if (parts.length === 0) return latest.trim();
  return parts.join("\n");
}

function buildSupportQuery(text: string): SupportQuery {
  const details = extractNaturalLanguageDetails(text);
  return enrichSupportQuery(buildSupportQueryFromDetails(details, text));
}

function formatInvestigationReply(
  summary: string,
  sessionId: string,
  appBase?: string | null,
  ticketNote?: string,
  evidenceLinks?: string
): string {
  const base = appBase?.replace(/\/$/, "") ?? "";
  const link = base ? `\nOpen in AI Support Studio: ${base}/?investigation=${sessionId}` : "";
  return `${summary.slice(0, 2200)}${evidenceLinks ?? ""}${ticketNote ?? ""}${link}`.trim();
}

function formatChatReply(reply: string): string {
  return reply.slice(0, 2800);
}

/** Run investigation or follow-up chat from a Slack thread; returns assistant text for the thread. */
export async function enrichSlackThread(input: {
  channelId: string;
  threadTs: string;
  latestMessage: string;
  teamId?: string;
}): Promise<{ text: string; sessionId?: string; mode: "investigation" | "chat" | "ack" }> {
  const latest = input.latestMessage.trim();
  if (!latest) {
    return {
      text: "Describe the customer issue — symptoms, product, and when it started. I'll find matching tickets and investigate.",
      mode: "ack",
    };
  }

  const thread = await getSlackThread(input.channelId, input.threadTs, input.teamId);
  const sessionId = thread?.investigationSessionId;
  const combined = await threadQueryText(input.channelId, input.threadTs, latest);
  const query = buildSupportQuery(combined);
  const appBase = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_BASE_URL;

  if (isCqlAuthoringRequest(combined, query, { latestMessage: latest })) {
    const text = await buildCqlSlackReply(combined, appBase, sessionId);
    return { text, sessionId, mode: sessionId ? "chat" : "investigation" };
  }

  if (sessionId) {
    try {
      const { reply } = await runInvestigationChat(sessionId, latest);
      return { text: formatChatReply(reply), sessionId, mode: "chat" };
    } catch {
      /* fall through to new investigation if session expired */
    }
  }

  const query2 = query;
  const shouldInvestigate =
    combined.length >= 12 ||
    INVESTIGATION_KEYWORDS.test(combined) ||
    Boolean(query2.statusCode || query2.endpoint || query2.symptom);

  if (!shouldInvestigate) {
    // Stay silent in channel threads until the user @mentions the bot.
    if (!thread?.investigationSessionId && !input.channelId.startsWith("D")) {
      return { text: "", mode: "ack" };
    }
    return {
      text: "I'm tracking this thread. Describe what's failing (product, error, when it started) and I'll match Zendesk/Jira tickets and investigate.",
      mode: "ack",
    };
  }

  const preResolved = await resolveTicketsFromContext(query2);
  const investigationQuery: SupportQuery = {
    ...query2,
    issueRef: query2.issueRef ?? preResolved.jiraIssueKey,
  };

  const result = await runInvestigation(investigationQuery);
  await setSlackThreadInvestigation(
    input.channelId,
    input.threadTs,
    result.sessionId,
    input.teamId
  );

  const links = mergeResolvedTicketLinks(preResolved, result.context);
  const slackThreadId = `${input.channelId}:${input.threadTs}`;

  await upsertInvestigationLinks(result.sessionId, {
    sourceSystem: "slack",
    slackThreadId,
    jiraIssueKey: links.jiraIssueKey,
    zendeskTicketId: links.zendeskTicketId,
    customerSummary: combined.slice(0, 500),
  }).catch(() => undefined);

  const appBase2 = appBase;
  const summary =
    result.chatReply ??
    result.report?.plainEnglishSummary ??
    result.markdownReport?.slice(0, 1200) ??
    "Investigation started.";
  const ticketNote = formatAutoLinkedTicketsNote(links);
  const evidenceLinks = result.context ? formatEvidenceLinksSlack(result.context) : "";

  return {
    text: formatInvestigationReply(summary, result.sessionId, appBase2, ticketNote, evidenceLinks),
    sessionId: result.sessionId,
    mode: "investigation",
  };
}
