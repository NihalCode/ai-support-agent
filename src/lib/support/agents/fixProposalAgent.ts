import "server-only";

import type { AgentResult, FixProposal, RootCauseHypothesis, CodeFinding } from "../investigation/types";

export function runFixProposalAgent(
  rootCause: RootCauseHypothesis,
  code: CodeFinding
): AgentResult<FixProposal> {
  const start = Date.now();
  const affectedFiles = code.files
    .map((f) => String(f.metadata?.filePath ?? ""))
    .filter(Boolean)
    .slice(0, 5);

  const fixable =
    rootCause.category === "configuration" ||
    rootCause.category === "user-error" ||
    (rootCause.category === "new-bug" && affectedFiles.length > 0) ||
    rootCause.category === "regression";

  const missingInfo: string[] = [];
  if (rootCause.category === "missing-info" || rootCause.confidence === "low") {
    missingInfo.push("Need endpoint, error message, or request ID before proposing a code patch.");
  }

  return {
    agent: "fixProposal",
    ok: true,
    mock: code.mock,
    warnings: missingInfo,
    durationMs: Date.now() - start,
    data: {
      fixable,
      suspectedRootCause: rootCause.likelyCause,
      affectedFiles,
      proposedChange:
        affectedFiles.length > 0
          ? `Review ${affectedFiles[0]} for null checks, error handling, and validation around ${rootCause.affectedEndpoint ?? "the reported endpoint"}.`
          : undefined,
      testPlan: [
        "Reproduce with the customer's payload and credentials.",
        "Add/extend unit test for the failing path.",
        "Verify in staging after deploy.",
      ],
      rollbackPlan: "Redeploy previous Vercel deployment if regression confirmed.",
      riskLevel: rootCause.severity === "critical" ? "high" : "medium",
      confidence: rootCause.confidence,
      requiresHumanReview: true,
      missingInfo: missingInfo.length ? missingInfo : undefined,
    },
  };
}
