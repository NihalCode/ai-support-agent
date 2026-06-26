import "server-only";

import { runInvestigation } from "../agents/orchestratorAgent";
import { createInvestigation, patchInvestigation } from "./object-store";
import {
  buildSupportQueryFromDetails,
  enrichSupportQuery,
  extractNaturalLanguageDetails,
  formatPlainEnglishIntro,
  isSupportLikeMessage,
  missingInfoQuestions,
} from "./extract-query";
import { enrichWithEndpointInference, describeEndpointInference } from "./infer-api";
import type { InvestigateResponse, SupportQuery, InvestigationContext } from "./types";
import { hasJira, getConfig } from "../config";
import { isTestMode } from "@/lib/test-mode";
import { newSessionId, saveSession } from "./session-store";

export interface EnsureInvestigationInput {
  userMessage: string;
  currentInvestigationId?: string | null;
  currentSessionId?: string | null;
}

export interface AutoInvestigationResult extends InvestigateResponse {
  investigationId?: string;
  introMarkdown: string;
  endpointInferenceNote?: string | null;
}

export { isSupportLikeMessage };

/** Reuse an active session or create a new investigation from natural language. */
export async function ensureInvestigationSession(input: EnsureInvestigationInput): Promise<AutoInvestigationResult> {
  if (input.currentSessionId) {
    const { getSession } = await import("./session-store");
    const existing = await getSession(input.currentSessionId);
    if (existing) {
      return {
        sessionId: existing.sessionId,
        report: existing.report,
        context: existing,
        needsMoreInfo: existing.missingQuestions.length > 0,
        missingQuestions: existing.missingQuestions,
        investigationId: input.currentInvestigationId ?? undefined,
        introMarkdown: "",
        markdownReport: undefined,
      };
    }
  }

  return createInvestigationFromNaturalLanguage(input.userMessage, input.currentInvestigationId ?? undefined);
}

function buildMockInvestigationContext(
  sessionId: string,
  userMessage: string,
  query: SupportQuery,
  missing: ReturnType<typeof missingInfoQuestions>
): InvestigationContext {
  const now = new Date().toISOString();
  const title =
    query.workflowName ??
    query.issueRef ??
    userMessage.slice(0, 72).trim() ??
    "Support investigation";
  const report = {
    title,
    plainEnglishSummary:
      "Based on available evidence, this may be a timeout or missing required field in the workflow payload. No endpoint was required to start the investigation.",
    currentStatus: "needs-more-information" as const,
    severity: "medium" as const,
    confidence: "medium" as const,
    whatWeFound: {
      jira: query.issueRef ? `Checked ticket ${query.issueRef} (mock).` : "No Jira ticket linked.",
      logs: "Mock logs suggest a timeout after ~30 seconds.",
      code: "Mock code search — no blocking defect confirmed yet.",
      deployments: "No recent deployment regression detected (mock).",
      docs: query.endpoint
        ? `Reviewed docs for ${query.endpoint}.`
        : "Searching imported API docs for related indicator and blocking workflows.",
      cql: query.workflowName?.match(/block|ip|indicator/i)
        ? "CQL docs checked for indicator filters (mock)."
        : undefined,
    },
    likelyCause: "Possible workflow timeout or incomplete action payload (mock triage).",
    isItFixed: "Unknown — check Jira for open matches.",
    recommendedNextStep:
      "Confirm whether every IP fails or only some. Share any visible error with engineering if timeouts continue.",
    customerResponse:
      "Thanks for reporting this. We're investigating the workflow delay and will follow up with next steps shortly.",
    developerNotes:
      "## Handoff\n- Workflow may be timing out at ~30s\n- Verify orchestration run logs and indicator action API payload\n- Ticket: " +
      (query.issueRef ?? "none"),
    jiraTicket: {
      title: title,
      summary: userMessage.slice(0, 500),
      customerImpact: "Workflow hangs or fails for support team.",
      suspectedRootCause: "Timeout or missing required field (mock).",
      severity: "medium" as const,
      priority: "Medium",
      linkedTickets: query.issueRef ? [query.issueRef] : [],
      relatedFiles: [],
      acceptanceCriteria: ["Workflow completes within SLA", "Customer receives actionable status"],
      questionsForCustomer: missing.map((m) => m.question),
      status: "draft" as const,
    },
  };

  return {
    sessionId,
    query,
    missingQuestions: missing,
    jira: {
      tickets: [],
      openMatches: query.issueRef ? 1 : 0,
      closedMatches: 0,
      summary: query.issueRef ? `Mock Jira lookup for ${query.issueRef}.` : "No ticket searched.",
      mock: true,
    },
    code: { files: [], commits: [], pullRequests: [], summary: "Mock code search.", mock: true },
    logs: {
      entries: [],
      patterns: ["timeout"],
      summary: "Mock log pattern: upstream timeout after 30s.",
      mock: true,
    },
    deployments: {
      deployments: [],
      regressionSuspected: false,
      summary: "No deployment regression (mock).",
      mock: true,
    },
    docs: {
      docs: [],
      summary: query.endpoint ? `Docs for ${query.endpoint}` : "Docs search for blocking workflows (mock).",
      mock: true,
    },
    rootCause: {
      likelyCause: report.likelyCause,
      confidence: "medium",
      severity: "medium",
      category: "unknown",
      evidenceIds: [],
    },
    fixProposal: {
      fixable: false,
      suspectedRootCause: report.likelyCause,
      affectedFiles: [],
      testPlan: [],
      rollbackPlan: "",
      riskLevel: "low",
      confidence: "medium",
      requiresHumanReview: true,
    },
    report,
    evidence: [],
    chatHistory: [],
    modes: { jira: "mock", github: "mock", vercel: "mock", vectors: "mock" },
    createdAt: now,
    updatedAt: now,
  };
}

/** Fast deterministic investigation for TEST_MODE / E2E — no external calls. */
export async function createMockInvestigationFromNaturalLanguage(
  userMessage: string,
  existingInvestigationId?: string
): Promise<AutoInvestigationResult> {
  const details = extractNaturalLanguageDetails(userMessage);
  let query = buildSupportQueryFromDetails(details, userMessage);
  query = enrichSupportQuery(query);
  query = enrichWithEndpointInference(query);
  const missing = missingInfoQuestions(query);
  const endpointNote = describeEndpointInference(query);
  const sessionId = newSessionId();
  const ctx = buildMockInvestigationContext(sessionId, userMessage, query, missing);
  await saveSession(ctx);

  const knownDetails = [
    details.workflowName && { id: "workflow", label: "Workflow", value: details.workflowName },
    details.supportTicketId && { id: "ticket", label: "Support ticket", value: details.supportTicketId },
    (details.approximateStartTime || query.timestamp) && {
      id: "time",
      label: "Timing",
      value: details.approximateStartTime ?? query.timestamp ?? "",
    },
    (details.symptom || query.symptom) && {
      id: "symptom",
      label: "Symptom",
      value: details.symptom ?? query.symptom ?? "",
    },
    query.endpoint && { id: "endpoint", label: "Endpoint", value: query.endpoint },
  ]
    .filter(Boolean)
    .map((d) => ({
      ...(d as { id: string; label: string; value: string }),
      at: new Date().toISOString(),
    }));

  let investigationId = existingInvestigationId;
  if (!investigationId) {
    investigationId = createInvestigation({
      title: ctx.report.title,
      userIssue: userMessage,
      sessionId,
      status: "in_progress",
      knownDetails,
      missingDetails: missing.map((m) => ({ id: m.id, question: m.question, whyNeeded: m.whyNeeded })),
      relevantEndpoints: query.inferredEndpoints ?? (query.endpoint ? [query.endpoint] : []),
      relevantJiraTickets: details.supportTicketId ? [details.supportTicketId] : [],
      suspectedRootCause: ctx.report.likelyCause,
      confidence: ctx.report.confidence,
      customerFacingResponse: ctx.report.customerResponse,
      developerHandoff: ctx.report.developerNotes,
      recommendedNextStep: ctx.report.recommendedNextStep,
    }).id;
  }

  let intro = formatPlainEnglishIntro(details, query, missing);
  if (endpointNote) intro += `\n${endpointNote}\n`;
  intro +=
    "\n---\n\n**Summary:** Based on prior evidence, the bulk tag API likely fails due to a missing required field in the payload. Check `name` and `type` fields per API docs.\n";

  const result: InvestigateResponse = {
    sessionId,
    report: ctx.report,
    context: ctx,
    needsMoreInfo: missing.length > 0,
    missingQuestions: missing,
    credentialGaps: [],
    supervisorReason: "Test mode mock investigation",
  };

  return { ...result, investigationId, introMarkdown: intro, endpointInferenceNote: endpointNote };
}

/** Create and run a full investigation pipeline from a free-text support message. */
export async function createInvestigationFromNaturalLanguage(
  userMessage: string,
  existingInvestigationId?: string
): Promise<AutoInvestigationResult> {
  if (isTestMode()) {
    return createMockInvestigationFromNaturalLanguage(userMessage, existingInvestigationId);
  }

  const details = extractNaturalLanguageDetails(userMessage);
  let query = buildSupportQueryFromDetails(details, userMessage);
  query = enrichSupportQuery(query);
  query = enrichWithEndpointInference(query);

  const missing = missingInfoQuestions(query);
  const endpointNote = describeEndpointInference(query);

  const result = await runInvestigation(query);

  const knownDetails = [
    details.workflowName && { id: "workflow", label: "Workflow", value: details.workflowName },
    details.supportTicketId && { id: "ticket", label: "Support ticket", value: details.supportTicketId },
    (details.approximateStartTime || query.timestamp) && {
      id: "time",
      label: "Timing",
      value: details.approximateStartTime ?? query.timestamp ?? "",
    },
    (details.symptom || query.symptom) && {
      id: "symptom",
      label: "Symptom",
      value: details.symptom ?? query.symptom ?? "",
    },
    query.endpoint && { id: "endpoint", label: "Endpoint", value: query.endpoint },
  ]
    .filter(Boolean)
    .map((d) => ({
      ...(d as { id: string; label: string; value: string }),
      at: new Date().toISOString(),
    }));

  const cfg = getConfig();
  const jiraGap =
    details.supportTicketId && !hasJira(cfg)
      ? `I found ticket ${details.supportTicketId}, but Jira is not connected, so I can't read it yet.`
      : undefined;

  let investigationId = existingInvestigationId;
  if (investigationId) {
    patchInvestigation(investigationId, {
      sessionId: result.sessionId,
      status: "in_progress",
      knownDetails,
      missingDetails: missing.map((m) => ({
        id: m.id,
        question: m.question,
        whyNeeded: m.whyNeeded,
      })),
      relevantEndpoints: query.inferredEndpoints ?? (query.endpoint ? [query.endpoint] : []),
      relevantJiraTickets: details.supportTicketId ? [details.supportTicketId] : [],
      suspectedRootCause: result.report.likelyCause,
      confidence: result.report.confidence,
      customerFacingResponse: result.report.customerResponse,
      developerHandoff: result.report.developerNotes,
      recommendedNextStep: result.report.recommendedNextStep,
      addTimeline: {
        type: "chat_started",
        summary: "Investigation updated from chat message",
      },
    });
  } else {
    const inv = createInvestigation({
      title: result.report.title,
      userIssue: userMessage,
      sessionId: result.sessionId,
      status: "in_progress",
      knownDetails,
      missingDetails: missing.map((m) => ({
        id: m.id,
        question: m.question,
        whyNeeded: m.whyNeeded,
      })),
      relevantEndpoints: query.inferredEndpoints ?? (query.endpoint ? [query.endpoint] : []),
      relevantJiraTickets: details.supportTicketId ? [details.supportTicketId] : [],
      suspectedRootCause: result.report.likelyCause,
      confidence: result.report.confidence,
      customerFacingResponse: result.report.customerResponse,
      developerHandoff: result.report.developerNotes,
      recommendedNextStep: result.report.recommendedNextStep,
    });
    investigationId = inv.id;
  }

  let intro = formatPlainEnglishIntro(details, query, missing);
  if (endpointNote) intro += `\n${endpointNote}\n`;
  if (jiraGap) intro += `\n${jiraGap}\n`;

  if (result.markdownReport) {
    intro += `\n---\n\n${result.markdownReport}`;
  } else if (result.report.plainEnglishSummary) {
    intro += `\n---\n\n**Summary:** ${result.report.plainEnglishSummary}\n\n**Customer response draft:**\n${result.report.customerResponse}`;
  }

  return {
    ...result,
    investigationId,
    introMarkdown: intro,
    endpointInferenceNote: endpointNote,
  };
}

export function buildQueryFromMessage(message: string): SupportQuery {
  const details = extractNaturalLanguageDetails(message);
  let query = buildSupportQueryFromDetails(details, message);
  query = enrichSupportQuery(query);
  return enrichWithEndpointInference(query);
}
