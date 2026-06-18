import { NextResponse } from "next/server";
import {
  resolveRepoRef,
  getGitHubTickets,
  getJiraTickets,
  ticketConnectorForRef,
} from "@/lib/support/connectors";

export const runtime = "nodejs";

/**
 * Search GitHub + Jira tickets, or fetch a single one by ref.
 * GET /api/support/tickets?q=...&repoUrl=...  -> search both sources
 * GET /api/support/tickets?ref=PROJ-1&repoUrl=...  -> fetch one
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const ref = url.searchParams.get("ref")?.trim();
  const repoUrl = url.searchParams.get("repoUrl")?.trim() || undefined;
  const { ref: repoRef } = resolveRepoRef(repoUrl);

  try {
    if (ref) {
      const { connector, mock } = ticketConnectorForRef(ref, repoRef);
      const issue = await connector.getIssue(ref);
      return NextResponse.json({ issue, source: connector.id, mock });
    }
    if (!q) {
      return NextResponse.json({ error: "Provide ?q= or ?ref=" }, { status: 400 });
    }
    const gh = getGitHubTickets(repoRef);
    const jira = getJiraTickets();
    const [ghIssues, jiraIssues] = await Promise.all([
      gh.connector.searchIssues(q, 5).catch(() => []),
      jira.connector.searchIssues(q, 5).catch(() => []),
    ]);
    return NextResponse.json({
      github: { issues: ghIssues, mock: gh.mock },
      jira: { issues: jiraIssues, mock: jira.mock },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ticket lookup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
