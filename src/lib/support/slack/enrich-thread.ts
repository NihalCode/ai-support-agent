import "server-only";

import { runInvestigation, runInvestigationChat } from "../agents/orchestratorAgent";
import { extractNaturalLanguageDetails } from "../investigation/extract-query";
import type { SupportQuery } from "../investigation/types";
import { getSlackThread, setSlackThreadInvestigation } from "./thread-store";
import { upsertInvestigationLinks } from "../enterprise/stores/investigation-links-store";

const INVESTIGATION_KEYWORDS =
  /\b(error|fail|bug|issue|ticket|api|endpoint|cql|500|401|403|sync|help|investigate|broken)\b/i;

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
  return {
    text,
    issueRef: details.supportTicketId,
    endpoint: details.endpoint,
    feature: details.workflowName,
  };
}

function formatInvestigationReply(summary: string, sessionId: string, appBase?: string | null): string {
  const base = appBase?.replace(/\/$/, "") ?? "";
  const link = base ? `\nOpen in AI Support Studio: ${base}/?investigation=${sessionId}` : "";
  return `${summary.slice(0, 2800)}${link}`.trim();
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
      text: "Send a ticket ID, endpoint, or error description and I’ll investigate.",
      mode: "ack",
    };
  }

  const thread = await getSlackThread(input.channelId, input.threadTs, input.teamId);
  const sessionId = thread?.investigationSessionId;

  if (sessionId) {
    try {
      const { reply } = await runInvestigationChat(sessionId, latest);
      return { text: formatChatReply(reply), sessionId, mode: "chat" };
    } catch {
      /* fall through to new investigation if session expired */
    }
  }

  const combined = await threadQueryText(input.channelId, input.threadTs, latest);
  const shouldInvestigate =
    combined.length >= 12 || INVESTIGATION_KEYWORDS.test(combined) || Boolean(buildSupportQuery(combined).issueRef);

  if (!shouldInvestigate) {
    return {
      text: "I’m tracking this thread. Share a ticket key, API path, or error message and I’ll run an investigation.",
      mode: "ack",
    };
  }

  const result = await runInvestigation(buildSupportQuery(combined));
  await setSlackThreadInvestigation(
    input.channelId,
    input.threadTs,
    result.sessionId,
    input.teamId
  );

  const slackThreadId = `${input.channelId}:${input.threadTs}`;
  const query = buildSupportQuery(combined);
  await upsertInvestigationLinks(result.sessionId, {
    sourceSystem: "slack",
    slackThreadId,
    zendeskTicketId: query.issueRef,
    customerSummary: combined.slice(0, 500),
  }).catch(() => undefined);

  const appBase = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_BASE_URL;
  const summary =
    result.chatReply ??
    result.markdownReport?.slice(0, 500) ??
    result.report?.plainEnglishSummary ??
    "Investigation started.";
  return {
    text: formatInvestigationReply(summary, result.sessionId, appBase),
    sessionId: result.sessionId,
    mode: "investigation",
  };
}
