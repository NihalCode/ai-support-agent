import "server-only";

import type {
  AgentResult,
  RootCauseHypothesis,
  SupportQuery,
  JiraFinding,
  CodeFinding,
  LogFinding,
  DeploymentFinding,
  DocsFinding,
  InvestigationConfidence,
  InvestigationSeverity,
} from "../investigation/types";

function isServerError(statusCode?: number): boolean {
  return typeof statusCode === "number" && statusCode >= 500;
}

function mentionsUpstreamFailure(query: SupportQuery): boolean {
  const hay = `${query.errorMessage ?? ""} ${query.text}`;
  return /upstream timeout|service unavailable|gateway timeout|502|503|504/i.test(hay);
}

function docSummary(docs: DocsFinding): string {
  const first = docs.docs[0];
  if (!first) return "";
  const method = first.metadata?.method ?? "";
  const path = first.metadata?.path ?? first.title;
  return method ? `${method} ${path}` : String(path);
}

export function runRootCauseAgent(input: {
  query: SupportQuery;
  jira: JiraFinding;
  code: CodeFinding;
  logs: LogFinding;
  deployments: DeploymentFinding;
  docs: DocsFinding;
}): AgentResult<RootCauseHypothesis> {
  const start = Date.now();
  const { query, jira, code, logs, deployments, docs } = input;
  const evidenceIds: string[] = [
    ...jira.tickets.slice(0, 2).map((t) => t.id),
    ...logs.entries.slice(0, 2).map((l) => l.id),
    ...code.files.slice(0, 2).map((f) => f.id),
    ...docs.docs.slice(0, 2).map((d) => d.id),
    ...deployments.deployments.slice(0, 1).map((d) => d.id),
  ].filter(Boolean);

  let category: RootCauseHypothesis["category"] = "unknown";
  let likelyCause = "Insufficient evidence to determine root cause.";
  let confidence: InvestigationConfidence = "low";
  let severity: InvestigationSeverity = "medium";

  const serverError =
    isServerError(query.statusCode) ||
    logs.patterns.includes("5xx server errors") ||
    mentionsUpstreamFailure(query);
  const timeoutLikely =
    logs.patterns.includes("timeouts") || mentionsUpstreamFailure(query);
  const latestDeploy = deployments.deployments[0]?.title ?? deployments.deployments[0]?.summary;
  const endpointLabel = query.endpoint ?? "reported endpoint";
  const docRef = docSummary(docs);

  if (jira.duplicateOf) {
    category = "duplicate";
    likelyCause = `This appears to duplicate existing ticket ${jira.duplicateOf}.`;
    confidence = "high";
  } else if (jira.alreadyFixedIn) {
    category = "already-fixed";
    likelyCause = `A related ticket was resolved (${jira.alreadyFixedIn}). Customer may need to upgrade or apply the documented fix.`;
    confidence = "high";
    severity = "low";
  } else if (logs.patterns.includes("auth failures") || query.statusCode === 401 || query.statusCode === 403) {
    category = "configuration";
    likelyCause = "Authentication or permissions misconfiguration (invalid token, AccessID, or missing scopes).";
    confidence = "medium";
  } else if (serverError) {
    category = deployments.regressionSuspected ? "regression" : "new-bug";
    const statusLabel = query.statusCode ? `HTTP ${query.statusCode}` : "5xx";
    if (deployments.regressionSuspected) {
      likelyCause = `${statusLabel} on ${endpointLabel} started after a recent deployment${latestDeploy ? ` (${latestDeploy})` : ""}. Likely a regression — compare deploy diffs and check upstream timeouts.`;
      confidence = code.files.length > 0 || docs.docs.length > 0 ? "high" : "medium";
    } else if (timeoutLikely) {
      likelyCause = `${statusLabel} on ${endpointLabel} with upstream timeout — backend or dependency saturation, not a client payload issue${docRef ? ` (documented as ${docRef})` : ""}.`;
      confidence = docs.docs.length > 0 ? "medium" : "low";
    } else {
      likelyCause = `${statusLabel} server error on ${endpointLabel} — application or infrastructure failure in the handler${docRef ? ` (${docRef} is documented)` : ""}.`;
      confidence = code.files.length > 0 || docs.docs.length > 0 ? "high" : "medium";
    }
    severity = query.statusCode === 503 || timeoutLikely ? "high" : "medium";
  } else if (docs.docs.length > 0 && (query.statusCode === 400 || query.text.match(/missing (field|param)/i))) {
    category = "user-error";
    likelyCause = "Request may not match documented API requirements (missing parameter or payload field).";
    confidence = "medium";
    severity = "low";
  } else if (jira.openMatches > 0) {
    category = "known-bug";
    likelyCause = `Matches ${jira.openMatches} open Jira ticket(s) — likely a known issue under investigation.`;
    confidence = "medium";
  } else if (deployments.regressionSuspected && (query.timestamp || query.statusCode)) {
    category = "regression";
    likelyCause = `Issue timing correlates with recent deployment${latestDeploy ? ` ${latestDeploy}` : ""}. Investigate changes since last release.`;
    confidence = "medium";
  } else if (docs.docs.length > 0 && query.endpoint) {
    category = query.statusCode && query.statusCode >= 400 ? "new-bug" : "unknown";
    likelyCause =
      query.statusCode && query.statusCode >= 500
        ? `Server-side failure on ${endpointLabel}. API docs confirm ${docRef} — validate tenant health and backend logs (request ${query.requestId ?? query.traceId ?? "ID not in log drain"}).`
        : `Endpoint ${endpointLabel} matches API documentation (${docRef}). Review request against spec and tenant configuration.`;
    confidence = "medium";
  } else if (code.files.length > 0) {
    category = "new-bug";
    likelyCause = code.codePathSummary ?? "Code paths identified — requires engineering review.";
    confidence = "medium";
  } else if (query.endpoint && query.statusCode && (query.requestId || query.traceId || query.errorMessage)) {
    category = "new-bug";
    likelyCause = `Structured report for ${endpointLabel} (${query.statusCode}) — no duplicate Jira ticket found. Engineering should trace request ${query.requestId ?? query.traceId ?? "ID"} in tenant logs.`;
    confidence = "medium";
  }

  if (query.text.match(/critical|outage|production down/i)) severity = "critical";

  return {
    agent: "rootCause",
    ok: true,
    mock: jira.mock && code.mock && logs.mock,
    warnings: [],
    durationMs: Date.now() - start,
    data: {
      likelyCause,
      confidence,
      severity,
      category,
      affectedEndpoint: query.endpoint,
      affectedFeature: query.feature,
      reproducible: Boolean(query.reproductionSteps || query.errorMessage),
      evidenceIds,
    },
  };
}
