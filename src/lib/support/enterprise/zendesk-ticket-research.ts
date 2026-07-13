import "server-only";

import { searchZendeskForAgent } from "./zendesk-search";
import { getZendeskConnectorStatus, type ZendeskConnectorStatus } from "./zendesk-readiness";
import type { NormalizedIssue } from "../types";

const STOP_WORDS = new Set([
  "after", "and", "before", "can", "customer", "did", "find", "from", "have",
  "mentioned", "please", "seeing", "similar", "started", "summarize", "that",
  "the", "they", "ticket", "tickets", "what", "with", "you", "zendesk",
]);

function concepts(query: string): string[] {
  return [...new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9_-]+/)
      .filter((term) => term.length >= 3 && !STOP_WORDS.has(term))
  )].slice(0, 16);
}

function documentedOutcome(ticket: NormalizedIssue): string {
  const resolutionComments = ticket.comments.filter((comment) =>
    /\b(resolv|fixed|workaround|root cause|completed|closed|solution|upgrade|patch)\b/i.test(comment.body)
  );
  const source = resolutionComments.at(-1) ?? ticket.comments.at(-1);
  if (!source?.body.trim()) {
    return "No documented resolution was present in the indexed ticket content.";
  }
  return source.body.replace(/\s+/g, " ").trim().slice(0, 520);
}

function rankTicket(ticket: NormalizedIssue, terms: string[]): number {
  const subject = ticket.title.toLowerCase();
  const body = ticket.body.toLowerCase();
  const comments = ticket.comments.map((comment) => comment.body).join(" ").toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (subject.includes(term)) score += 8;
    if (body.includes(term)) score += 3;
    if (comments.includes(term)) score += 2;
    if (ticket.labels.some((tag) => tag.toLowerCase().includes(term))) score += 4;
  }
  if (/solved|closed|resolved/i.test(ticket.state)) score += 8;
  if (/\b(resolv|fixed|workaround|root cause|solution)\b/i.test(comments)) score += 10;
  return score;
}

function relevance(ticket: NormalizedIssue, terms: string[]): string {
  const haystack = `${ticket.title} ${ticket.body} ${ticket.labels.join(" ")}`.toLowerCase();
  const matched = terms.filter((term) => haystack.includes(term)).slice(0, 5);
  return matched.length > 0
    ? `Matches ${matched.join(", ")}${/solved|closed|resolved/i.test(ticket.state) ? " and has a completed status" : ""}.`
    : "Closest semantic match in the Zendesk index.";
}

export interface ZendeskTicketResearchMatch {
  ticket: NormalizedIssue;
  score: number;
  whyRelevant: string;
  documentedOutcome: string;
}

export interface ZendeskTicketResearchResult {
  status: ZendeskConnectorStatus;
  matches: ZendeskTicketResearchMatch[];
  queryTerms: string[];
  durationMs: number;
  traceId: string;
}

export async function researchZendeskTickets(
  query: string,
  limit = 5,
  organizationId?: string
): Promise<ZendeskTicketResearchResult> {
  const started = Date.now();
  const traceId = crypto.randomUUID();
  const status = await getZendeskConnectorStatus(organizationId);
  const queryTerms = concepts(query);

  if (!status.enabled || !status.connected || status.syncState === "never_synced") {
    return { status, matches: [], queryTerms, durationMs: Date.now() - started, traceId };
  }
  if (status.ticketsStored > 0 && status.ticketsIndexed === 0) {
    return { status, matches: [], queryTerms, durationMs: Date.now() - started, traceId };
  }

  const broadQuery = queryTerms.join(" ") || query;
  const { tickets } = await searchZendeskForAgent(
    broadQuery,
    30,
    undefined,
    organizationId
  );
  const seen = new Set<string>();
  const matches = tickets
    .filter((ticket) => {
      const key = ticket.key ?? ticket.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((ticket) => ({
      ticket,
      score: rankTicket(ticket, queryTerms),
      whyRelevant: relevance(ticket, queryTerms),
      documentedOutcome: documentedOutcome(ticket),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    status,
    matches,
    queryTerms,
    durationMs: Date.now() - started,
    traceId,
  };
}

function dateLabel(value?: string): string {
  return value ? new Date(value).toISOString().slice(0, 10) : "not available";
}

export function formatZendeskResearchResponse(result: ZendeskTicketResearchResult): string {
  const { status } = result;
  if (!status.enabled) {
    return "Zendesk search is disabled for this workspace. An administrator must enable the Zendesk knowledge source.";
  }
  if (!status.connected || status.syncState === "never_synced") {
    return "Zendesk is not connected for this workspace and no synchronized ticket history is available. An administrator or developer must connect or import Zendesk data before ticket history can be searched.";
  }
  if (status.syncState === "failed") {
    return `Zendesk search failed due to an internal retrieval error. Request ID: ${result.traceId}`;
  }
  if (status.ticketsStored > 0 && status.ticketsIndexed === 0) {
    return "Zendesk tickets were synchronized, but indexing has not completed. Search results would not yet be reliable.";
  }
  if (result.matches.length === 0) {
    return "I searched the synchronized Zendesk history but found no relevant matches. Try adding an exact product name, feature, error message, or ticket ID.";
  }

  const [best, ...others] = result.matches;
  const key = best.ticket.key ?? best.ticket.id;
  const staleNote =
    status.syncState === "stale" && status.lastSuccessfulSyncAt
      ? `\n\n_Note: the index may be stale; last successful sync was ${status.lastSuccessfulSyncAt}._`
      : "";
  const otherLines = others.map((match) => {
    const otherKey = match.ticket.key ?? match.ticket.id;
    return `- **${otherKey}** — ${match.ticket.title} (${match.ticket.state}). ${match.whyRelevant}`;
  });

  return [
    `I found ${result.matches.length} relevant Zendesk ticket${result.matches.length === 1 ? "" : "s"}.`,
    `## Most similar: ${key}`,
    `**Issue:** ${best.ticket.title}`,
    `**Status:** ${best.ticket.state} · **Priority:** ${best.ticket.priority ?? "not available"}`,
    `**Created:** ${dateLabel(best.ticket.createdAt)} · **Updated:** ${dateLabel(best.ticket.updatedAt)}`,
    `**Why it is relevant:** ${best.whyRelevant}`,
    `**Documented outcome:** ${best.documentedOutcome}`,
    best.ticket.url ? `**Ticket:** ${best.ticket.url}` : `**Citation:** Zendesk ${key}`,
    ...(otherLines.length ? ["## Other related tickets", ...otherLines] : []),
    "## Recommended next steps",
    "1. Compare the current product/version and symptom against the most similar ticket.",
    "2. Validate the documented outcome in the cited ticket before applying it to the current customer.",
    "3. If the symptoms differ, refine the search with an exact error message or affected feature.",
  ].join("\n\n") + staleNote;
}
