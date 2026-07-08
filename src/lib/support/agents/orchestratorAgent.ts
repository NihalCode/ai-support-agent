import "server-only";

import type {
  InvestigationContext,
  InvestigateResponse,
  SupportQuery,
  SupportTriageReport,
  CurrentStatus,
  EvidenceItem,
  InvestigationChatMessage,
} from "../investigation/types";
import { enrichSupportQuery } from "../investigation/extract-query";
import { userExplicitlyAskedForCommits } from "../developer-handoff";
import { enrichWithEndpointInference } from "../investigation/infer-api";
import { newSessionId, saveSession, getSession } from "../investigation/session-store";
import { runJiraAgent } from "../agents/jiraAgent";
import { runCodeAgent } from "../agents/codeAgent";
import { runLogsAgent } from "../agents/logsAgent";
import { runDeploymentAgent } from "../agents/deploymentAgent";
import { runDocsAgent } from "../agents/docsAgent";
import { runEnterpriseSearchAgent } from "../agents/enterpriseSearchAgent";
import { runRootCauseAgent } from "../agents/rootCauseAgent";
import { runFixProposalAgent } from "../agents/fixProposalAgent";
import { runResponseWriterAgent } from "../agents/responseWriterAgent";
import { runJiraTicketWriterAgent } from "../agents/jiraTicketWriterAgent";
import { runCqlAgent } from "../agents/cqlAgent";
import { runVersionAgent } from "../agents/versionAgent";
import { planInvestigation, formatInvestigationMarkdown, detectCredentialGaps } from "../agents/supervisorAgent";
import type { CqlFinding } from "../agents/cqlAgent";
import type { VersionFinding } from "../agents/versionAgent";
import { ensureAutoImported } from "../bootstrap/auto-import";
import { getConfig, hasOpenAI } from "../config";
import { getVectorStore } from "../vector-store";
import { vercelMode } from "../services/vercelService";
import { chatJson, type ChatMessage } from "../openai";

function statusFromCategory(
  category: string,
  jira: { duplicateOf?: string; alreadyFixedIn?: string; openMatches: number }
): CurrentStatus {
  if (category === "duplicate" || jira.duplicateOf) return "duplicate";
  if (category === "already-fixed" || jira.alreadyFixedIn) return "already-fixed";
  if (category === "known-bug" || jira.openMatches > 0) return "known-issue";
  if (category === "regression") return "regression";
  if (category === "missing-info") return "needs-more-information";
  if (category === "configuration" || category === "user-error") return "configuration-issue";
  if (category === "new-bug") return "new-issue";
  return "needs-more-information";
}

function buildReport(input: {
  query: SupportQuery;
  jira: InvestigationContext["jira"];
  code: InvestigationContext["code"];
  logs: InvestigationContext["logs"];
  deployments: InvestigationContext["deployments"];
  docs: InvestigationContext["docs"];
  cql?: CqlFinding;
  version?: VersionFinding;
  rootCause: InvestigationContext["rootCause"];
  fix: InvestigationContext["fixProposal"];
  jiraDraft: InvestigationContext["report"]["jiraTicket"];
  customerMessage: string;
}): SupportTriageReport {
  const { query, jira, code, logs, deployments, docs, cql, version, rootCause, fix, jiraDraft, customerMessage } =
    input;

  const title =
    (query.endpoint ??
      query.feature ??
      query.issueRef ??
      query.text.slice(0, 80).trim()) ||
    "Support investigation";

  const isItFixed = version?.alreadyFixed === true
    ? `Likely fixed in ${version.fixVersions[0] ?? jira.alreadyFixedIn ?? "a prior release"}.`
    : jira.alreadyFixedIn
      ? `Appears fixed in ${jira.alreadyFixedIn} (see linked Jira evidence).`
      : jira.duplicateOf
        ? `Tracked under ${jira.duplicateOf} — not a new issue.`
        : version?.alreadyFixed === false
          ? "Open tickets suggest not yet fixed."
          : "No evidence of a prior fix in Jira.";

  return {
    title,
    plainEnglishSummary: rootCause.likelyCause,
    currentStatus: statusFromCategory(rootCause.category, jira),
    severity: rootCause.severity,
    confidence: rootCause.confidence,
    whatWeFound: {
      jira: jira.summary,
      logs: logs.summary,
      code: code.summary,
      deployments: deployments.summary,
      docs: docs.summary,
      cql: cql?.summary,
      version: version?.summary,
    },
    likelyCause: rootCause.likelyCause,
    isItFixed,
    recommendedNextStep: fix.fixable
      ? `Engineering: review ${fix.affectedFiles[0] ?? "identified files"} and apply the proposed fix. Support: send customer update below.`
      : jiraDraft.status === "duplicate-blocked"
        ? `Link to ${jira.duplicateOf} — do not create a new ticket.`
        : rootCause.category === "regression" || rootCause.category === "new-bug"
          ? `Engineering: trace ${query.requestId ?? query.traceId ?? "the request"} on ${query.endpoint ?? "the endpoint"} in tenant logs; compare recent deployment ${deployments.deployments[0]?.title ?? ""}. Support: send customer update below.`
          : rootCause.confidence !== "low"
            ? "Review evidence and create Jira ticket if not already tracked."
            : "Gather missing details (endpoint, time, request ID) and re-run investigation.",
    customerResponse: customerMessage,
    developerNotes: [
      "## Root cause",
      rootCause.likelyCause,
      "",
      "## Code",
      code.files.map((f) => `- ${f.title}: ${f.url ?? ""}`).join("\n") || "None",
      "",
      "## Logs",
      logs.entries.map((l) => `- ${l.title}: ${l.summary}`).join("\n") || "None",
      "",
      "## Jira",
      jira.tickets.map((t) => `- ${t.title} (${t.url ?? ""})`).join("\n") || "None",
      "",
      "## Fix proposal",
      fix.proposedChange ?? "No patch yet.",
    ].join("\n"),
    jiraTicket: jiraDraft,
  };
}

function collectEvidence(ctx: Partial<InvestigationContext>): EvidenceItem[] {
  return [
    ...(ctx.jira?.tickets ?? []),
    ...(ctx.code?.files ?? []),
    ...(ctx.code?.commits ?? []),
    ...(ctx.code?.pullRequests ?? []),
    ...(ctx.logs?.entries ?? []),
    ...(ctx.deployments?.deployments ?? []),
    ...(ctx.docs?.docs ?? []),
  ];
}

/** Run full multi-agent investigation pipeline. */
export async function runInvestigation(rawQuery: SupportQuery): Promise<InvestigateResponse> {
  await ensureAutoImported().catch(() => undefined);

  const query = enrichWithEndpointInference(enrichSupportQuery(rawQuery));
  const plan = planInvestigation(query);
  const missing = plan.missingQuestions;

  if (!plan.canProceed) {
    const sessionId = newSessionId();
    const now = new Date().toISOString();
    const empty = emptyContext(sessionId, query, missing, now);
    await saveSession(empty);
    return {
      sessionId,
      report: empty.report,
      context: empty,
      needsMoreInfo: true,
      missingQuestions: missing,
      credentialGaps: plan.credentialGaps,
      supervisorReason: plan.routingReason,
    };
  }

  const [jiraR, codeR, logsR, deployR, docsR, enterpriseR, cqlR] = await Promise.all([
    runJiraAgent(query),
    runCodeAgent(query),
    runLogsAgent(query),
    runDeploymentAgent(query),
    runDocsAgent(query),
    runEnterpriseSearchAgent(query),
    runCqlAgent(query),
  ]);

  docsR.data = {
    ...docsR.data,
    docs: [...docsR.data.docs, ...enterpriseR.data.docs],
    summary: [docsR.data.summary, enterpriseR.data.summary].filter(Boolean).join(" "),
    mock: docsR.data.mock && enterpriseR.data.mock,
  };

  const versionR = await runVersionAgent(query, jiraR.data, codeR.data);

  const rootCauseR = runRootCauseAgent({
    query,
    jira: jiraR.data,
    code: codeR.data,
    logs: logsR.data,
    deployments: deployR.data,
    docs: docsR.data,
  });

  const fixR = runFixProposalAgent(rootCauseR.data, codeR.data);

  const sessionId = newSessionId();
  const now = new Date().toISOString();

  const jiraDraftR = runJiraTicketWriterAgent({
    query,
    jira: jiraR.data,
    rootCause: rootCauseR.data,
    fix: fixR.data,
    code: codeR.data,
    logs: logsR.data,
  });

  const draftReport = buildReport({
    query,
    jira: jiraR.data,
    code: codeR.data,
    logs: logsR.data,
    deployments: deployR.data,
    docs: docsR.data,
    cql: cqlR.data,
    version: versionR.data,
    rootCause: rootCauseR.data,
    fix: fixR.data,
    jiraDraft: jiraDraftR.data,
    customerMessage: "",
  });

  const responseR = runResponseWriterAgent(
    {
      plainEnglishSummary: draftReport.plainEnglishSummary,
      recommendedNextStep: draftReport.recommendedNextStep,
      whatWeFound: draftReport.whatWeFound,
    },
    rootCauseR.data
  );

  const report = buildReport({
    query,
    jira: jiraR.data,
    code: codeR.data,
    logs: logsR.data,
    deployments: deployR.data,
    docs: docsR.data,
    cql: cqlR.data,
    version: versionR.data,
    rootCause: rootCauseR.data,
    fix: fixR.data,
    jiraDraft: jiraDraftR.data,
    customerMessage: responseR.data.message,
  });

  const store = getVectorStore();
  const ctx: InvestigationContext = {
    sessionId,
    query,
    missingQuestions: missing,
    jira: jiraR.data,
    code: codeR.data,
    logs: logsR.data,
    deployments: deployR.data,
    docs: docsR.data,
    cql: cqlR.data,
    version: versionR.data,
    rootCause: rootCauseR.data,
    fixProposal: fixR.data,
    report,
    evidence: [],
    chatHistory: [],
    modes: {
      jira: jiraR.mock ? "mock" : "live",
      github: codeR.mock ? "mock" : "live",
      vercel: vercelMode(),
      vectors: store.isMock ? "mock" : "live",
    },
    createdAt: now,
    updatedAt: now,
  };
  ctx.evidence = collectEvidence(ctx);
  const markdownReport = formatInvestigationMarkdown(ctx);
  await saveSession(ctx);

  return {
    sessionId,
    report,
    context: ctx,
    needsMoreInfo: false,
    missingQuestions: [],
    markdownReport,
    credentialGaps: detectCredentialGaps().gaps,
    supervisorReason: plan.routingReason,
  };
}

function emptyContext(
  sessionId: string,
  query: SupportQuery,
  missing: InvestigationContext["missingQuestions"],
  now: string
): InvestigationContext {
  const store = getVectorStore();
  const report: SupportTriageReport = {
    title: "More information needed",
    plainEnglishSummary:
      query.technicalLevel === "non-technical"
        ? "I'm checking docs, tickets, and logs based on what you described. I'll ask simple follow-up questions only if something critical is missing."
        : "Investigation started from your description. Optional technical details (endpoint, request ID) can refine results.",
    currentStatus: "needs-more-information",
    severity: "low",
    confidence: "low",
    whatWeFound: { jira: "", logs: "", code: "", deployments: "", docs: "" },
    likelyCause: "Not enough information.",
    isItFixed: "Unknown.",
    recommendedNextStep: missing.map((m) => m.question).join(" "),
    customerResponse: `Thanks for reaching out. ${missing[0]?.question ?? "Can you share more details?"}`,
    developerNotes: "",
    jiraTicket: {
      title: "",
      summary: "",
      customerImpact: "",
      suspectedRootCause: "",
      severity: "low",
      priority: "Low",
      linkedTickets: [],
      relatedFiles: [],
      acceptanceCriteria: [],
      questionsForCustomer: missing.map((m) => m.question),
      status: "not-created",
    },
  };

  return {
    sessionId,
    query,
    missingQuestions: missing,
    jira: { tickets: [], openMatches: 0, closedMatches: 0, summary: "", mock: true },
    code: { files: [], commits: [], pullRequests: [], summary: "", mock: true },
    logs: { entries: [], patterns: [], summary: "", mock: true },
    deployments: { deployments: [], regressionSuspected: false, summary: "", mock: true },
    docs: { docs: [], summary: "", mock: false },
    rootCause: {
      likelyCause: "Missing information",
      confidence: "low",
      severity: "low",
      category: "missing-info",
      evidenceIds: [],
    },
    fixProposal: {
      fixable: false,
      suspectedRootCause: "",
      affectedFiles: [],
      testPlan: [],
      rollbackPlan: "",
      riskLevel: "low",
      confidence: "low",
      requiresHumanReview: true,
    },
    report,
    evidence: [],
    chatHistory: [],
    modes: { jira: "mock", github: "mock", vercel: "mock", vectors: store.isMock ? "mock" : "live" },
    createdAt: now,
    updatedAt: now,
  };
}

/** Cursor-like follow-up Q&A grounded in investigation evidence. */
export async function runInvestigationChat(
  sessionId: string,
  message: string
): Promise<{ reply: string; citations: InvestigationChatMessage["citations"] }> {
  const ctx = await getSession(sessionId);
  if (!ctx) throw new Error("Investigation session not found or expired.");

  const userMsg: InvestigationChatMessage = {
    role: "user",
    content: message,
    at: new Date().toISOString(),
  };
  ctx.chatHistory.push(userMsg);

  const evidenceBlock = ctx.evidence
    .slice(0, 20)
    .map((e) => `[${e.sourceType}] ${e.title}: ${e.summary}`)
    .join("\n");

  const reportBlock = JSON.stringify(
    {
      title: ctx.report.title,
      status: ctx.report.currentStatus,
      likelyCause: ctx.report.likelyCause,
      whatWeFound: ctx.report.whatWeFound,
      fix: ctx.fixProposal,
    },
    null,
    2
  );

  let reply: string;
  const cfg = getConfig();

  if (hasOpenAI(cfg) && cfg.openaiApiKey) {
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: `You are a support engineering copilot (Cursor-like IDE for investigations).
Answer ONLY from the investigation evidence below. Cite source types (Jira, code, logs, deployment, docs).
If evidence is missing, say what is missing — do not invent files, tickets, or logs.
Keep answers concise and actionable.`,
      },
      {
        role: "user",
        content: `INVESTIGATION REPORT:\n${reportBlock}\n\nEVIDENCE:\n${evidenceBlock}\n\nUSER QUESTION:\n${message}`,
      },
    ];
    const raw = await chatJson<{ answer?: string }>(
      [
        ...messages,
        { role: "user", content: 'Reply JSON: {"answer":"..."}' },
      ],
      cfg.openaiApiKey,
      { temperature: 0.2, maxTokens: 900 }
    );
    reply = raw.answer?.trim() ?? heuristicChatReply(ctx, message);
  } else {
    reply = heuristicChatReply(ctx, message);
  }

  const citations = ctx.evidence.slice(0, 5).map((e) => ({
    sourceType: e.sourceType,
    label: e.title,
  }));

  ctx.chatHistory.push({ role: "assistant", content: reply, citations, at: new Date().toISOString() });
  ctx.updatedAt = new Date().toISOString();
  await saveSession(ctx);

  return { reply, citations };
}

function heuristicChatReply(ctx: InvestigationContext, message: string): string {
  const m = message.toLowerCase();
  const wantsCommits = userExplicitlyAskedForCommits(message);
  if (/known|duplicate|jira/i.test(m)) {
    return `${ctx.jira.summary}${ctx.jira.duplicateOf ? ` Duplicate of ${ctx.jira.duplicateOf}.` : ""}`;
  }
  if (/code|file|endpoint|implement/i.test(m)) {
    return ctx.code.codePathSummary ?? ctx.code.summary;
  }
  if (/log|500|error|proof/i.test(m)) {
    return ctx.logs.entries.length
      ? `Log evidence: ${ctx.logs.entries.map((l) => l.summary).join(" | ")}`
      : ctx.logs.summary;
  }
  if (wantsCommits && /deploy|regression|release|commit/i.test(m)) {
    return ctx.deployments.summary;
  }
  if (/fix|patch|can we fix/i.test(m)) {
    return ctx.fixProposal.fixable
      ? `Fixable (${ctx.fixProposal.confidence} confidence): ${ctx.fixProposal.proposedChange ?? "Review affected files."} Risk: ${ctx.fixProposal.riskLevel}.`
      : `Not enough evidence for a safe patch. ${ctx.fixProposal.missingInfo?.join(" ") ?? ""}`;
  }
  if (/customer|explain|non-technical/i.test(m)) {
    return ctx.report.customerResponse;
  }
  if (/create.*jira|ticket/i.test(m)) {
    return `Jira ticket status: ${ctx.report.jiraTicket.status}. ${ctx.report.jiraTicket.status === "duplicate-blocked" ? "Duplicate — do not create." : "Use Create Jira ticket after review."}`;
  }
  return `Summary: ${ctx.report.plainEnglishSummary}\n\nNext: ${ctx.report.recommendedNextStep}`;
}

export { getSession } from "../investigation/session-store";
