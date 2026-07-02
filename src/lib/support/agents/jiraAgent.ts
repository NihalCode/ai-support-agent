import "server-only";

import type { AgentResult, EvidenceItem, JiraFinding, SupportQuery } from "../investigation/types";
import { getJiraTickets } from "../connectors";
import {
  contextSearchQuery,
  parseExplicitTicketRefs,
  scoreTicketAgainstQuery,
} from "../investigation/ticket-context";
import type { NormalizedIssue } from "../types";

function toEvidence(issue: NormalizedIssue): EvidenceItem {
  const fixed = /done|closed|resolved|fixed/i.test(issue.state);
  return {
    id: `jira-${issue.key ?? issue.id}`,
    sourceType: "jira",
    title: `${issue.key ?? issue.id}: ${issue.title}`,
    summary: `${issue.state}${fixed ? " (possibly fixed)" : ""} — ${issue.body.slice(0, 280)}`,
    url: issue.url,
    metadata: { state: issue.state, labels: issue.labels.join(", ") },
  };
}

function detectDuplicate(tickets: NormalizedIssue[], q: SupportQuery): string | undefined {
  const ep = q.endpoint?.toLowerCase();
  for (const t of tickets) {
    const hay = `${t.title} ${t.body}`.toLowerCase();
    if (ep && hay.includes(ep.replace(/^\//, ""))) return t.key ?? t.id;
  }
  return undefined;
}

function detectFixedVersion(tickets: NormalizedIssue[]): string | undefined {
  for (const t of tickets) {
    if (/done|closed|resolved|fixed/i.test(t.state)) {
      const m = t.body.match(/fix(ed)?\s+(in\s+)?version\s+([\d.]+)/i);
      if (m) return m[3];
      return t.key ?? t.id;
    }
  }
  return undefined;
}

export async function runJiraAgent(q: SupportQuery): Promise<AgentResult<JiraFinding>> {
  const start = Date.now();
  const warnings: string[] = [];
  const { connector, mock } = await getJiraTickets();
  let tickets: NormalizedIssue[] = [];

  const explicit = parseExplicitTicketRefs(q.text ?? "");
  const jiraRef = q.issueRef && !/^ZD-/i.test(q.issueRef) ? q.issueRef : explicit.jira;

  if (jiraRef && /^[A-Z][A-Z0-9]+-\d+$/.test(jiraRef)) {
    const one = await connector.getIssue(jiraRef);
    if (one) tickets = [one];
  }

  const searchQ = contextSearchQuery(q);
  if (tickets.length === 0 && searchQ.trim()) {
    const hits = await connector.searchIssues(searchQ, 10);
    tickets = hits
      .map((issue) => ({ issue, score: scoreTicketAgainstQuery(issue, q) }))
      .sort((a, b) => b.score - a.score)
      .map((r) => r.issue);
  }

  const evidence = tickets.map(toEvidence);
  const openMatches = tickets.filter((t) => !/done|closed|resolved|fixed/i.test(t.state)).length;
  const closedMatches = tickets.length - openMatches;
  const duplicateOf = detectDuplicate(tickets, q);
  const alreadyFixedIn = detectFixedVersion(tickets);

  if (mock) warnings.push("Jira mock mode — set JIRA_* env vars for live tickets.");

  return {
    agent: "jira",
    ok: true,
    mock,
    warnings,
    durationMs: Date.now() - start,
    data: {
      tickets: evidence,
      duplicateOf,
      alreadyFixedIn,
      openMatches,
      closedMatches,
      summary:
        tickets.length === 0
          ? "No matching Jira tickets found."
          : `Found ${tickets.length} ticket(s): ${openMatches} open, ${closedMatches} closed/resolved.${duplicateOf ? ` Possible duplicate of ${duplicateOf}.` : ""}${alreadyFixedIn ? ` May be fixed in ${alreadyFixedIn}.` : ""}`,
      mock,
    },
  };
}
