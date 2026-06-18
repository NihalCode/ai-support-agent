import type { IssueAnalysis } from "./types";

/**
 * Comment drafting service. Produces customer-facing and internal-engineering
 * text from an analysis. Pure functions (no I/O) so they're trivially testable.
 */

export function draftCustomerComment(analysis: IssueAnalysis): string {
  return analysis.suggestedTicketResponse.trim();
}

export function draftEngineeringNote(analysis: IssueAnalysis): string {
  const lines: string[] = [];
  lines.push(`**Internal triage note**`);
  lines.push("");
  lines.push(`**Category:** ${analysis.category}`);
  lines.push(`**Fixability:** ${analysis.fixability}`);
  lines.push(`**Confidence:** ${analysis.confidence}`);
  lines.push("");
  lines.push(`**Root cause:** ${analysis.rootCause}`);
  if (analysis.evidence.length) {
    lines.push("");
    lines.push(`**Evidence:**`);
    for (const e of analysis.evidence) lines.push(`- ${e}`);
  }
  if (analysis.escalationNote) {
    lines.push("");
    lines.push(`**Escalation:** ${analysis.escalationNote}`);
  }
  if (analysis.codeFix) {
    lines.push("");
    lines.push(`**Proposed fix:** ${analysis.codeFix.filePath} (risk: ${analysis.codeFix.riskLevel})`);
    lines.push(analysis.codeFix.why);
  }
  if (analysis.citations.length) {
    lines.push("");
    lines.push(`**Sources:**`);
    for (const c of analysis.citations) {
      lines.push(`- ${c.label}${c.url ? ` (${c.url})` : ""}`);
    }
  }
  return lines.join("\n");
}

/** Suggest labels / priority / assignee from the analysis (advisory only). */
export function suggestTriageMeta(analysis: IssueAnalysis): {
  labels: string[];
  priority: "low" | "medium" | "high";
  assignee: "client" | "support" | "engineering";
  needsEngineering: boolean;
  needsEngineeringReason?: string;
} {
  const labels = new Set<string>();
  switch (analysis.category) {
    case "new-bug":
    case "known-bug":
      labels.add("bug");
      break;
    case "feature-request":
      labels.add("enhancement");
      break;
    case "documentation":
      labels.add("documentation");
      break;
    case "permissions":
      labels.add("auth");
      break;
    case "environment":
      labels.add("configuration");
      break;
    case "user-error":
      labels.add("question");
      break;
  }

  let priority: "low" | "medium" | "high" = "medium";
  if (analysis.category === "new-bug" && analysis.confidence !== "Low") priority = "high";
  if (analysis.category === "feature-request" || analysis.category === "documentation") priority = "low";

  let assignee: "client" | "support" | "engineering" = "support";
  if (analysis.fixability === "client-can-fix") assignee = "client";
  else if (analysis.fixability === "engineering-required") assignee = "engineering";

  const needsEngineering = analysis.fixability === "engineering-required";
  return {
    labels: [...labels],
    priority,
    assignee,
    needsEngineering,
    needsEngineeringReason: needsEngineering
      ? analysis.escalationNote ?? "No existing fix found; code-level investigation required."
      : undefined,
  };
}
