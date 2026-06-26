import "server-only";

import type {
  AgentResult,
  CustomerResponse,
  SupportTriageReport,
  RootCauseHypothesis,
} from "../investigation/types";

export function runResponseWriterAgent(
  report: Pick<
    SupportTriageReport,
    "plainEnglishSummary" | "recommendedNextStep" | "whatWeFound"
  >,
  rootCause: RootCauseHypothesis
): AgentResult<CustomerResponse> {
  const start = Date.now();
  const needsMoreInfo = rootCause.category === "missing-info" || rootCause.confidence === "low";

  const message = needsMoreInfo
    ? `Thank you for reporting this. ${report.plainEnglishSummary}\n\nTo investigate further, we need: ${report.recommendedNextStep}\n\nWe'll follow up as soon as we have those details.`
    : `Thank you for your patience. ${report.plainEnglishSummary}\n\n${report.recommendedNextStep}\n\nWe're treating this as ${rootCause.severity} severity and will update you shortly.`;

  return {
    agent: "responseWriter",
    ok: true,
    mock: false,
    warnings: [],
    durationMs: Date.now() - start,
    data: { message, tone: "professional", needsMoreInfo },
  };
}
