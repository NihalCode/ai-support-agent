import "server-only";

import type { InvestigationContext } from "./types";
import type { IssueAnalysis, RetrievedChunk } from "../types";

/** Map investigation context → IssueAnalysis for /api/support/patch. */
export function investigationToAnalysis(ctx: InvestigationContext): IssueAnalysis {
  const repo = ctx.query.repoUrl ?? "org/repository";
  const retrievedContext: RetrievedChunk[] = ctx.code.files.map((f, i) => ({
    id: f.id,
    score: Math.max(0.1, 1 - i * 0.05),
    text: f.summary,
    metadata: {
      repo,
      branch: "main",
      filePath: String(f.metadata?.filePath ?? f.title),
      language: "typescript",
      lineStart: typeof f.metadata?.lineStart === "number" ? f.metadata.lineStart : undefined,
      lineEnd: typeof f.metadata?.lineEnd === "number" ? f.metadata.lineEnd : undefined,
      sourceType: "code",
      url: f.url,
    },
  }));

  const evidence = [
    ctx.jira.summary,
    ctx.logs.summary,
    ctx.code.summary,
    ctx.deployments.summary,
    ctx.docs.summary,
  ].filter(Boolean);

  const category: IssueAnalysis["category"] =
    ctx.rootCause.category === "user-error"
      ? "user-error"
      : ctx.rootCause.category === "configuration"
        ? "environment"
        : ctx.rootCause.category === "new-bug" || ctx.rootCause.category === "regression"
          ? "new-bug"
          : ctx.rootCause.category === "known-bug"
            ? "known-bug"
            : "unknown";

  return {
    summary: ctx.report.plainEnglishSummary,
    rootCause: ctx.rootCause.likelyCause,
    confidence:
      ctx.rootCause.confidence === "high"
        ? "High"
        : ctx.rootCause.confidence === "medium"
          ? "Medium"
          : "Low",
    evidence,
    fixability: ctx.fixProposal.fixable ? "engineering-required" : "not-enough-info",
    category,
    fixSteps: ctx.fixProposal.proposedChange
      ? [ctx.fixProposal.proposedChange]
      : ctx.report.recommendedNextStep.split("\n").filter(Boolean),
    codeFix: null,
    questionsForClient: ctx.report.jiraTicket.questionsForCustomer,
    suggestedTicketResponse: ctx.report.customerResponse,
    escalationNote: ctx.fixProposal.requiresHumanReview ? "Human review required before merge." : null,
    citations: ctx.evidence.slice(0, 8).map((e) => ({
      label: e.title,
      url: e.url,
      sourceType:
        e.sourceType === "jira"
          ? ("jira" as const)
          : e.sourceType === "commit"
            ? ("commit" as const)
            : e.sourceType === "pr"
              ? ("pr" as const)
              : e.sourceType === "docs"
                ? ("docs" as const)
                : ("code" as const),
      filePath: typeof e.metadata?.filePath === "string" ? e.metadata.filePath : undefined,
    })),
    retrievedContext,
    usedLlm: true,
  };
}
