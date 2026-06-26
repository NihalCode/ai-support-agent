import "server-only";

import type {
  InvestigationContext,
  SupportQuery,
  MissingInformationQuestion,
  InvestigationConfidence,
} from "../investigation/types";
import { missingInfoQuestions } from "../investigation/extract-query";
import { getConfig, hasJira, hasGitHub, hasOpenAI, hasPinecone, hasVercel } from "../config";

export type SpecialistAgent =
  | "jira"
  | "code"
  | "logs"
  | "deployment"
  | "docs"
  | "cql"
  | "version"
  | "rootCause"
  | "fix"
  | "response"
  | "jiraTicket";

export interface SupervisorPlan {
  agents: SpecialistAgent[];
  missingQuestions: MissingInformationQuestion[];
  credentialGaps: string[];
  canProceed: boolean;
  routingReason: string;
}

export interface CredentialStatus {
  jira: boolean;
  github: boolean;
  openai: boolean;
  pinecone: boolean;
  vercel: boolean;
  ctix: boolean;
}

export function detectCredentialGaps(): CredentialStatus & { gaps: string[] } {
  const cfg = getConfig();
  const status: CredentialStatus = {
    jira: hasJira(cfg),
    github: hasGitHub(cfg),
    openai: hasOpenAI(cfg),
    pinecone: hasPinecone(cfg),
    vercel: hasVercel(cfg),
    ctix: Boolean(cfg.cywareProducts.ctix.baseUrl),
  };
  const gaps: string[] = [];
  if (!status.jira) gaps.push("Jira credentials missing — cannot search/create tickets (docs-only mode for Jira).");
  if (!status.github) gaps.push("GitHub token missing — using mock repo data.");
  if (!status.pinecone) gaps.push("Pinecone not configured — using in-memory vector store.");
  if (!status.vercel) gaps.push("Vercel token missing — mock deployment/log data.");
  return { ...status, gaps };
}

/** Supervisor: classify query, decide agents, identify missing info and credential blockers. */
export function planInvestigation(query: SupportQuery): SupervisorPlan {
  const missingQuestions = missingInfoQuestions(query);
  const credentialGaps = detectCredentialGaps().gaps;
  const agents: SpecialistAgent[] = ["docs", "jira", "code", "logs", "deployment"];

  const needsCql =
    /\bcql\b/i.test(query.text) ||
    /\b(malicious|indicator.*filter|query language|block.*ip)\b/i.test(query.text) ||
    Boolean(query.workflowName && /block|ip|indicator/i.test(query.workflowName));
  if (needsCql) agents.push("cql");

  const needsVersion =
    /fixed|version|release|upgrade|regression|changelog/i.test(query.text) ||
    Boolean(query.version) ||
    Boolean(query.issueRef);
  if (needsVersion) agents.push("version");

  agents.push("rootCause", "fix", "response", "jiraTicket");

  // Natural-language support issues should always proceed — missing questions are follow-ups only.
  const canProceed =
    query.text.trim().length > 0 ||
    Boolean(query.issueRef || query.endpoint || query.workflowName || query.feature);

  let routingReason = "Full investigation pipeline";
  if (missingQuestions.length > 0) {
    routingReason =
      query.technicalLevel === "non-technical"
        ? "Plain-language issue — running agents and asking simple follow-ups only if needed"
        : "Running investigation with optional technical follow-ups";
  } else if (needsCql) {
    routingReason = "CQL-related query — include CQL agent";
  } else if (query.statusCode && query.statusCode >= 500) {
    routingReason = "Server error — prioritize logs, deployment, and version agents";
  }

  return {
    agents,
    missingQuestions,
    credentialGaps,
    canProceed,
    routingReason,
  };
}

export function formatInvestigationMarkdown(ctx: Partial<InvestigationContext>): string {
  const q = ctx.query;
  const report = ctx.report;
  const root = ctx.rootCause;
  const version = ctx.version;

  const lines = [
    "# Investigation Summary",
    "",
    "## User Issue",
    q?.text ?? report?.title ?? "(none)",
    "",
    "## Details Known",
    `- Endpoint: ${q?.endpoint ?? "—"}`,
    `- Status code: ${q?.statusCode ?? "—"}`,
    `- Request ID: ${q?.requestId ?? q?.traceId ?? "—"}`,
    `- Timestamp: ${q?.timestamp ?? "—"}`,
    `- Environment: ${q?.environment ?? q?.version ?? "—"}`,
    "",
    "## Missing Details",
    ...(ctx.missingQuestions?.length
      ? ctx.missingQuestions.map((m) => `- ${m.question}`)
      : ["- None"]),
    "",
    "## Evidence Checked",
    `- API docs: ${ctx.docs?.summary ?? "—"}`,
    `- CQL docs: ${ctx.cql?.summary ?? "—"}`,
    `- Logs: ${ctx.logs?.summary ?? "—"}`,
    `- Jira: ${ctx.jira?.summary ?? "—"}`,
    `- Code: ${ctx.code?.summary ?? "—"}`,
    `- Release/version history: ${version?.summary ?? "—"}`,
    "",
    "## Most Likely Cause",
    root?.likelyCause ?? report?.likelyCause ?? "Unknown",
    "",
    "## Confidence",
    report?.confidence ?? root?.confidence ?? "low",
    "",
    "## Is This Already Fixed?",
    version?.alreadyFixed === true ? "Yes" : version?.alreadyFixed === false ? "No" : "Unknown",
    "",
    "## Support Can Resolve?",
    root?.category === "user-error" || root?.category === "configuration"
      ? "Yes"
      : root?.category === "duplicate" || root?.category === "already-fixed"
        ? "Yes"
        : root?.confidence === "high" && ctx.fixProposal?.fixable
          ? "Yes (with engineering patch review)"
          : "Needs Engineering",
    "",
    "## Recommended Next Step",
    report?.recommendedNextStep ?? "—",
    "",
    "## Customer-Facing Response",
    report?.customerResponse ?? "—",
    "",
    "## Developer Handoff",
    report?.developerNotes ?? "—",
  ];
  return lines.join("\n");
}

export function confidenceLabel(c: InvestigationConfidence): string {
  return c.charAt(0).toUpperCase() + c.slice(1);
}
