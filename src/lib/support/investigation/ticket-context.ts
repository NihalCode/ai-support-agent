import "server-only";

import { getJiraTickets, getZendeskTickets } from "../connectors";
import {
  getStoredZendeskTicket,
  searchStoredZendeskTickets,
} from "../enterprise/stores/zendesk-ticket-store";
import type { NormalizedIssue } from "../types";
import type { InvestigationContext, SupportQuery } from "./types";

const STOP_WORDS = new Set([
  "about",
  "after",
  "been",
  "customer",
  "error",
  "fail",
  "failed",
  "failing",
  "from",
  "have",
  "help",
  "issue",
  "just",
  "like",
  "morning",
  "need",
  "please",
  "report",
  "reports",
  "seeing",
  "since",
  "that",
  "their",
  "this",
  "ticket",
  "today",
  "what",
  "when",
  "with",
  "would",
  "investigate",
  "authentication",
]);

const JIRA_KEY_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/g;
const ZENDESK_KEY_RE = /\b(ZD-\d+)\b/i;

/** Minimum relevance score to auto-link a ticket without an explicit key. */
export const AUTO_LINK_MIN_SCORE = 10;

export interface ResolvedTicketLinks {
  jiraIssueKey?: string;
  zendeskTicketId?: string;
  autoLinkedJira: boolean;
  autoLinkedZendesk: boolean;
}

export function parseExplicitTicketRefs(text: string): {
  jira?: string;
  zendesk?: string;
} {
  const zendesk = text.match(ZENDESK_KEY_RE)?.[1]?.toUpperCase();
  let jira: string | undefined;
  for (const m of text.matchAll(JIRA_KEY_RE)) {
    const key = m[1];
    if (/^ZD-\d+$/i.test(key)) continue;
    jira = key;
    break;
  }
  return { jira, zendesk: zendesk ? zendesk.replace(/^ZD-/i, "ZD-") : undefined };
}

/** Keyword query for Zendesk/Jira search from free-text issue context. */
export function contextSearchQuery(q: SupportQuery): string {
  const text = q.text ?? "";
  const tokens: string[] = [];

  if (q.statusCode) tokens.push(String(q.statusCode));
  if (/\bctix\b/i.test(text)) tokens.push("CTIX");
  if (/\b401|unauthorized\b/i.test(text)) tokens.push("401 unauthorized");
  if (/\b500|502|503|504\b/i.test(text)) tokens.push("500");
  if (/\btimeout|timed out\b/i.test(text)) tokens.push("timeout");
  if (q.workflowName) tokens.push(q.workflowName.slice(0, 60));
  if (q.symptom) tokens.push(q.symptom.slice(0, 60));
  if (q.errorMessage) tokens.push(q.errorMessage.slice(0, 60));

  for (const word of text.toLowerCase().split(/\W+/)) {
    if (word.length < 4 || STOP_WORDS.has(word)) continue;
    if (!tokens.some((t) => t.toLowerCase().includes(word))) tokens.push(word);
    if (tokens.length >= 10) break;
  }

  return tokens.join(" ").trim();
}

export function scoreTicketAgainstQuery(issue: NormalizedIssue, q: SupportQuery): number {
  const hay = `${issue.title} ${issue.body}`.toLowerCase();
  const text = (q.text ?? "").toLowerCase();
  let score = 0;

  for (const word of text.split(/\W+/)) {
    if (word.length >= 4 && !STOP_WORDS.has(word) && hay.includes(word)) score += 2;
  }

  if (q.statusCode && hay.includes(String(q.statusCode))) score += 15;
  if (/\bctix\b/i.test(text) && /\bctix\b/i.test(hay)) score += 12;
  if (/\b401|unauthorized\b/i.test(text) && /\b401|unauthorized\b/i.test(hay)) score += 12;
  if (q.workflowName && hay.includes(q.workflowName.toLowerCase().slice(0, 20))) score += 8;
  if (q.symptom && hay.includes(q.symptom.toLowerCase().slice(0, 24))) score += 6;
  if (!/closed|resolved|done|solved/i.test(issue.state)) score += 3;

  return score;
}

function pickBestTicket(
  issues: NormalizedIssue[],
  q: SupportQuery,
  minScore: number
): { issue: NormalizedIssue; score: number } | null {
  const ranked = issues
    .map((issue) => ({ issue, score: scoreTicketAgainstQuery(issue, q) }))
    .sort((a, b) => b.score - a.score);
  const top = ranked[0];
  if (!top || top.score < minScore) return null;
  return top;
}

function normalizeZendeskRef(issue: NormalizedIssue): string {
  const key = issue.key ?? issue.id;
  return /^ZD-/i.test(key) ? key.toUpperCase() : key.startsWith("ZD-") ? key : `ZD-${key.replace(/^ZD-/i, "")}`;
}

function normalizeJiraKey(issue: NormalizedIssue): string {
  return issue.key ?? issue.id;
}

/** Resolve Jira + Zendesk ticket links from message context (no pasted keys required). */
export async function resolveTicketsFromContext(
  q: SupportQuery,
  minScore = AUTO_LINK_MIN_SCORE
): Promise<ResolvedTicketLinks> {
  const explicit = parseExplicitTicketRefs(q.text ?? "");
  let jiraIssueKey = explicit.jira;
  let zendeskTicketId = explicit.zendesk;
  let autoLinkedJira = false;
  let autoLinkedZendesk = false;

  if (jiraIssueKey) {
    const { connector } = await getJiraTickets();
    const issue = await connector.getIssue(jiraIssueKey);
    if (issue) jiraIssueKey = normalizeJiraKey(issue);
  }

  if (zendeskTicketId) {
    const stored = await getStoredZendeskTicket(zendeskTicketId);
    if (stored) {
      zendeskTicketId = normalizeZendeskRef(stored);
    } else {
      const { connector } = await getZendeskTickets();
      const issue = await connector.getIssue(zendeskTicketId);
      if (issue) zendeskTicketId = normalizeZendeskRef(issue);
    }
  }

  const searchQ = contextSearchQuery(q);
  if (searchQ) {
    if (!jiraIssueKey) {
      const { connector } = await getJiraTickets();
      const hits = await connector.searchIssues(searchQ, 10);
      const best = pickBestTicket(hits, q, minScore);
      if (best) {
        jiraIssueKey = normalizeJiraKey(best.issue);
        autoLinkedJira = true;
      }
    }

    if (!zendeskTicketId) {
      const storedHits = await searchStoredZendeskTickets(searchQ, 10);
      const bestStored = pickBestTicket(storedHits, q, minScore);
      if (bestStored) {
        zendeskTicketId = normalizeZendeskRef(bestStored.issue);
        autoLinkedZendesk = true;
      } else {
        const { connector } = await getZendeskTickets();
        const hits = await connector.searchIssues(searchQ, 10);
        const best = pickBestTicket(hits, q, minScore);
        if (best) {
          zendeskTicketId = normalizeZendeskRef(best.issue);
          autoLinkedZendesk = true;
        }
      }
    }
  }

  return { jiraIssueKey, zendeskTicketId, autoLinkedJira, autoLinkedZendesk };
}

/** Prefer investigation hits, then pre-resolved context links. */
export function mergeResolvedTicketLinks(
  resolved: ResolvedTicketLinks,
  ctx?: Pick<InvestigationContext, "jira" | "docs">
): ResolvedTicketLinks {
  let { jiraIssueKey, zendeskTicketId, autoLinkedJira, autoLinkedZendesk } = resolved;

  if (!jiraIssueKey && ctx?.jira?.tickets?.length) {
    const top = ctx.jira.tickets[0];
    const key = top.title.match(/^([A-Z][A-Z0-9]+-\d+):/)?.[1];
    if (key) {
      jiraIssueKey = key;
      autoLinkedJira = true;
    }
  }

  if (!zendeskTicketId && ctx?.docs?.docs?.length) {
    const zd = ctx.docs.docs.find((d) => d.sourceType === "zendesk");
    if (zd?.title) {
      const key = zd.title.match(/^(ZD-\d+):/i)?.[1];
      if (key) {
        zendeskTicketId = key.toUpperCase();
        autoLinkedZendesk = true;
      }
    }
  }

  return { jiraIssueKey, zendeskTicketId, autoLinkedJira, autoLinkedZendesk };
}

export function formatAutoLinkedTicketsNote(links: ResolvedTicketLinks): string {
  const parts: string[] = [];
  if (links.jiraIssueKey) {
    parts.push(`Jira ${links.jiraIssueKey}${links.autoLinkedJira ? " (matched from context)" : ""}`);
  }
  if (links.zendeskTicketId) {
    parts.push(`Zendesk ${links.zendeskTicketId}${links.autoLinkedZendesk ? " (matched from context)" : ""}`);
  }
  if (parts.length === 0) return "";
  return `\n\nLinked tickets: ${parts.join(" · ")}`;
}
