import "server-only";

import type { AgentResult, SupportQuery, JiraFinding, CodeFinding } from "../investigation/types";

export interface VersionFinding {
  fixVersions: string[];
  affectedVersions: string[];
  relatedCommits: { title: string; url?: string }[];
  relatedPrs: { title: string; url?: string }[];
  alreadyFixed: boolean | null;
  summary: string;
  mock: boolean;
}

export async function runVersionAgent(
  q: SupportQuery,
  jira: JiraFinding,
  code: CodeFinding
): Promise<AgentResult<VersionFinding>> {
  const start = Date.now();
  const fixVersions: string[] = [];
  const affectedVersions: string[] = [];

  if (jira.alreadyFixedIn) fixVersions.push(jira.alreadyFixedIn);
  for (const t of jira.tickets) {
    const meta = t.metadata ?? {};
    if (typeof meta.fixVersion === "string") fixVersions.push(meta.fixVersion);
    if (typeof meta.affectedVersion === "string") affectedVersions.push(meta.affectedVersion);
    const summary = t.summary ?? "";
    const fixMatch = summary.match(/fix(?:ed)?\s+(?:in|version)\s+([\d.]+)/i);
    if (fixMatch) fixVersions.push(fixMatch[1]);
  }

  if (q.version) affectedVersions.push(q.version);

  const relatedCommits = code.commits.slice(0, 5).map((c) => ({ title: c.title, url: c.url }));
  const relatedPrs = code.pullRequests.slice(0, 5).map((p) => ({ title: p.title, url: p.url }));

  const asksFixed = /fixed|earlier version|newer version|already fix|regression since/i.test(q.text);
  let alreadyFixed: boolean | null = null;
  if (jira.alreadyFixedIn || fixVersions.length > 0) alreadyFixed = true;
  else if (jira.openMatches > 0) alreadyFixed = false;
  else if (asksFixed) alreadyFixed = null;

  let summary: string;
  if (alreadyFixed === true) {
    summary = `Likely fixed in ${fixVersions[0] ?? jira.alreadyFixedIn ?? "a prior release"} — verify customer version (${q.version ?? "unknown"}).`;
  } else if (relatedPrs.length > 0 || relatedCommits.length > 0) {
    summary = `Found ${relatedCommits.length} commit(s) and ${relatedPrs.length} PR/issue reference(s) — review for fix correlation.`;
  } else if (jira.openMatches > 0) {
    summary = "Open Jira ticket(s) suggest issue is not yet fixed in production.";
  } else {
    summary = "No fix version or release-note evidence found.";
  }

  return {
    agent: "version",
    ok: true,
    mock: jira.mock && code.mock,
    warnings: [],
    durationMs: Date.now() - start,
    data: {
      fixVersions: [...new Set(fixVersions)],
      affectedVersions: [...new Set(affectedVersions)],
      relatedCommits,
      relatedPrs,
      alreadyFixed,
      summary,
      mock: jira.mock,
    },
  };
}
