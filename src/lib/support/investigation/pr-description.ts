import "server-only";

import type { InvestigationContext } from "./types";
import { getConfig, hasOpenAI } from "../config";
import { chatJson, type ChatMessage } from "../openai";

export async function generatePrDescription(ctx: InvestigationContext): Promise<string> {
  const { report, fixProposal, query } = ctx;
  const cfg = getConfig();

  if (!hasOpenAI(cfg) || !cfg.openaiApiKey) {
    return heuristicPrDescription(ctx);
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "Write a concise GitHub pull request description for a support-engineering fix. Include Summary, Root cause, Changes, Test plan, and Rollback. Use markdown. Do not invent files not listed in affected files.",
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          issue: query.text,
          endpoint: query.endpoint,
          rootCause: report.likelyCause,
          affectedFiles: fixProposal.affectedFiles,
          proposedChange: fixProposal.proposedChange,
          testPlan: fixProposal.testPlan,
          rollbackPlan: fixProposal.rollbackPlan,
          severity: report.severity,
        },
        null,
        2
      ),
    },
    { role: "user", content: 'Reply JSON: {"description":"markdown string"}' },
  ];

  try {
    const raw = await chatJson<{ description?: string }>(messages, cfg.openaiApiKey, {
      temperature: 0.2,
      maxTokens: 1200,
    });
    return raw.description?.trim() || heuristicPrDescription(ctx);
  } catch {
    return heuristicPrDescription(ctx);
  }
}

function heuristicPrDescription(ctx: InvestigationContext): string {
  const { report, fixProposal, query } = ctx;
  return [
    "## Summary",
    report.plainEnglishSummary,
    "",
    "## Root cause",
    report.likelyCause,
    "",
    "## Customer report",
    query.text.slice(0, 500),
    "",
    "## Proposed change",
    fixProposal.proposedChange ?? "See affected files for manual review.",
    "",
    "## Affected files",
    fixProposal.affectedFiles.map((f) => `- ${f}`).join("\n") || "- (none identified)",
    "",
    "## Test plan",
    fixProposal.testPlan.map((t) => `- ${t}`).join("\n") || "- Re-run failing scenario",
    "",
    "## Rollback",
    fixProposal.rollbackPlan,
  ].join("\n");
}
