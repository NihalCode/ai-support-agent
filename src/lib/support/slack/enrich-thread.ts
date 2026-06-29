import "server-only";

import { runInvestigation, runInvestigationChat } from "../agents/orchestratorAgent";
import { extractNaturalLanguageDetails } from "../investigation/extract-query";
import type { SupportQuery } from "../investigation/types";
import { getSlackThread, setSlackThreadInvestigation } from "./thread-store";

const INVESTIGATION_KEYWORDS =
  /\b(error|fail|bug|issue|ticket|api|endpoint|cql|500|401|403|sync|help|investigate|broken)\b/i;

function threadQueryText(channelId: string, threadTs: string, latest: string): string {
  const thread = getSlackThread(channelId, threadTs);
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
}): Promise<{ text: string; sessionId?: string; mode: "investigation" | "chat" | "ack" }> {
  const latest = input.latestMessage.trim();
  if (!latest) {
    return {
      text: "Send a ticket ID, endpoint, or error description and I’ll investigate.",
      mode: "ack",
    };
  }

  const thread = getSlackThread(input.channelId, input.threadTs);
  const sessionId = thread?.investigationSessionId;

  if (sessionId) {
    try {
      const { reply } = await runInvestigationChat(sessionId, latest);
      return { text: formatChatReply(reply), sessionId, mode: "chat" };
    } catch {
      /* fall through to new investigation if session expired */
    }
  }

  const combined = threadQueryText(input.channelId, input.threadTs, latest);
  const shouldInvestigate =
    combined.length >= 12 || INVESTIGATION_KEYWORDS.test(combined) || Boolean(buildSupportQuery(combined).issueRef);

  if (!shouldInvestigate) {
    return {
      text: "I’m tracking this thread. Share a ticket key, API path, or error message and I’ll run an investigation.",
      mode: "ack",
    };
  }

  const result = await runInvestigation(buildSupportQuery(combined));
  setSlackThreadInvestigation(input.channelId, input.threadTs, result.sessionId);

  const summary =
    result.report.customerResponse ||
    result.report.likelyCause ||
    (typeof result.report.whatWeFound === "string"
      ? result.report.whatWeFound
      : JSON.stringify(result.report.whatWeFound)) ||
    `Investigation complete — status: ${result.report.currentStatus}.`;

  const { getConfig } = await import("../config");
  const cfg = getConfig();

  return {
    text: formatInvestigationReply(summary, result.sessionId, cfg.appBaseUrl),
    sessionId: result.sessionId,
    mode: "investigation",
  };
}
