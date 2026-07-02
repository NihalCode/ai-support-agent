import "server-only";

import type { AgentResult, DocsFinding, EvidenceItem, SupportQuery } from "../investigation/types";
import { getConfluenceDocs, getZendeskTickets } from "../connectors";
import { buildSearchTerms } from "../investigation/extract-query";

/** Shorter query for Zendesk/Confluence APIs (full buildSearchTerms breaks CQL / Zendesk search). */
function enterpriseSearchQuery(q: SupportQuery): string {
  if (q.issueRef && /^ZD-/i.test(q.issueRef)) return q.issueRef;
  const text = q.text ?? "";
  const keywords = [
    q.statusCode ? String(q.statusCode) : "",
    /\bctix\b/i.test(text) ? "CTIX" : "",
    /\b401|unauthorized\b/i.test(text) ? "401 unauthorized" : "",
    q.issueRef && !/^ZD-/i.test(q.issueRef) ? q.issueRef : "",
  ]
    .filter(Boolean)
    .join(" ");
  if (keywords.trim()) return keywords.trim();
  return buildSearchTerms(q).slice(0, 120);
}

export async function runEnterpriseSearchAgent(
  q: SupportQuery
): Promise<AgentResult<DocsFinding>> {
  const start = Date.now();
  const warnings: string[] = [];
  const terms = enterpriseSearchQuery(q);
  const docs: EvidenceItem[] = [];
  let mock = false;

  const zendesk = await getZendeskTickets();
  mock ||= zendesk.mock;
  try {
    const tickets = await zendesk.connector.searchIssues(terms, 6);
    for (const ticket of tickets) {
      docs.push({
        id: `zendesk-${ticket.key ?? ticket.id}`,
        sourceType: "zendesk",
        title: `${ticket.key ?? ticket.id}: ${ticket.title}`,
        summary: `${ticket.state} — ${(ticket.body || ticket.title).slice(0, 280)}`,
        url: ticket.url,
        metadata: { state: ticket.state, priority: ticket.priority },
      });
    }
  } catch (err) {
    warnings.push(`Zendesk search failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const confluence = await getConfluenceDocs();
  mock ||= confluence.mock;
  try {
    const pages = await confluence.connector.searchDocuments(terms, 6);
    for (const page of pages) {
      docs.push({
        id: `confluence-${page.id}`,
        sourceType: "confluence",
        title: page.title,
        summary: page.body.slice(0, 280),
        url: page.url,
        metadata: { spaceKey: page.spaceKey },
      });
    }
  } catch (err) {
    warnings.push(`Confluence search failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (zendesk.mock) warnings.push("Zendesk mock mode — set ZENDESK_* env vars for live tickets.");
  if (confluence.mock) warnings.push("Confluence mock mode — set CONFLUENCE_* env vars for live docs.");

  return {
    agent: "enterprise-search",
    ok: true,
    mock,
    warnings,
    durationMs: Date.now() - start,
    data: {
      docs,
      usageCorrect: undefined,
      summary:
        docs.length === 0
          ? "No Zendesk or Confluence evidence found."
          : `Found ${docs.length} enterprise evidence item(s) across Zendesk and Confluence.`,
      mock,
    },
  };
}
