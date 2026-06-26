import "server-only";

import type {
  AgentResult,
  JiraTicketDraft,
  SupportQuery,
  JiraFinding,
  RootCauseHypothesis,
  FixProposal,
  CodeFinding,
  LogFinding,
} from "../investigation/types";
import { getConfig } from "../config";

export function runJiraTicketWriterAgent(input: {
  query: SupportQuery;
  jira: JiraFinding;
  rootCause: RootCauseHypothesis;
  fix: FixProposal;
  code: CodeFinding;
  logs: LogFinding;
}): AgentResult<JiraTicketDraft> {
  const start = Date.now();
  const { query, jira, rootCause, fix, code, logs } = input;
  const cfg = getConfig();
  const projectKey = cfg.jira.projectKey ?? "SUPPORT";

  if (jira.duplicateOf) {
    return {
      agent: "jiraTicketWriter",
      ok: true,
      mock: jira.mock,
      warnings: ["Duplicate detected — ticket creation blocked."],
      durationMs: Date.now() - start,
      data: {
        title: query.endpoint ? `[Duplicate] ${query.endpoint} issue` : "Duplicate issue",
        summary: `Duplicate of ${jira.duplicateOf}. ${rootCause.likelyCause}`,
        customerImpact: query.text.slice(0, 500),
        suspectedRootCause: rootCause.likelyCause,
        severity: rootCause.severity,
        priority: rootCause.severity === "critical" ? "Highest" : "Medium",
        linkedTickets: [jira.duplicateOf],
        relatedFiles: fix.affectedFiles,
        acceptanceCriteria: ["Confirm duplicate and link tickets."],
        questionsForCustomer: [],
        status: "duplicate-blocked",
      },
    };
  }

  if (rootCause.confidence === "low" && rootCause.category === "unknown" && !query.endpoint) {
    return {
      agent: "jiraTicketWriter",
      ok: true,
      mock: jira.mock,
      warnings: ["Insufficient evidence — draft only, needs confirmation."],
      durationMs: Date.now() - start,
      data: {
        title: query.endpoint ? `Investigate ${query.endpoint}` : "Support investigation",
        summary: query.text.slice(0, 800),
        customerImpact: query.actualBehavior ?? query.text.slice(0, 300),
        environment: query.environment,
        reproductionSteps: query.reproductionSteps,
        suspectedRootCause: rootCause.likelyCause,
        severity: rootCause.severity,
        priority: "Medium",
        linkedTickets: jira.tickets.map((t) => t.title.split(":")[0] ?? "").filter(Boolean),
        relatedFiles: fix.affectedFiles,
        acceptanceCriteria: ["Root cause confirmed", "Fix deployed or workaround documented"],
        questionsForCustomer: ["Exact error message?", "Request ID?", "Timestamp?"],
        status: "needs-confirmation",
      },
    };
  }

  const logSnippet = logs.entries[0]?.summary ?? "No logs attached.";
  return {
    agent: "jiraTicketWriter",
    ok: true,
    mock: jira.mock,
    warnings: [],
    durationMs: Date.now() - start,
    data: {
      title: `${rootCause.severity.toUpperCase()}: ${query.endpoint ?? query.feature ?? "Customer-reported issue"}`,
      summary: `${query.text}\n\nLogs: ${logSnippet}\n\nCode: ${code.files[0]?.title ?? "n/a"}`,
      customerImpact: query.text.slice(0, 500),
      environment: query.environment ?? query.version,
      reproductionSteps: query.reproductionSteps,
      suspectedRootCause: rootCause.likelyCause,
      severity: rootCause.severity,
      priority: rootCause.severity === "critical" ? "Highest" : "High",
      linkedTickets: jira.tickets.map((t) => t.title.split(":")[0] ?? "").filter(Boolean),
      relatedFiles: fix.affectedFiles,
      acceptanceCriteria: [
        "Issue reproduced or explained",
        fix.fixable ? "Fix merged and deployed" : "Workaround documented",
      ],
      questionsForCustomer: [],
      status: "draft",
      payload: {
        projectKey,
        issueType: "Bug",
      },
    },
  };
}
