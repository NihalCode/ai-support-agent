import "server-only";

import type { CodePatch, IssueAnalysis, RetrievedChunk } from "./types";
import { getConfig, hasOpenAI } from "./config";
import { chatJson, type ChatMessage } from "./openai";

/**
 * Patch generation service. Produces a diff-style suggestion grounded ONLY in
 * retrieved code. Never invents files. Returns null when there isn't enough
 * evidence to propose a safe change. The agent never applies patches itself —
 * this is advisory output for human review.
 */
export async function generatePatch(opts: {
  description: string;
  analysis: IssueAnalysis;
}): Promise<CodePatch | null> {
  const { description, analysis } = opts;
  const codeChunks = analysis.retrievedContext.filter(
    (c) => c.metadata.sourceType === "code"
  );
  if (codeChunks.length === 0) return null;

  const cfg = getConfig();
  if (!hasOpenAI(cfg) || !cfg.openaiApiKey) {
    // Without an LLM we don't fabricate diffs; return the analysis's codeFix or a
    // safe "manual" stub anchored to the most relevant retrieved file.
    return analysis.codeFix ?? heuristicPatchStub(description, codeChunks);
  }

  try {
    return await llmPatch(description, analysis, codeChunks, cfg.openaiApiKey);
  } catch {
    return analysis.codeFix ?? heuristicPatchStub(description, codeChunks);
  }
}

function heuristicPatchStub(
  description: string,
  codeChunks: RetrievedChunk[]
): CodePatch | null {
  const top = codeChunks[0];
  if (!top) return null;
  return {
    filePath: top.metadata.filePath,
    why: `Most relevant code to "${description.slice(0, 80)}". Review this location; an LLM key is required to auto-draft a precise diff.`,
    riskLevel: "low",
    diff: `# Manual review required (no OpenAI key configured)\n# File: ${top.metadata.filePath}${top.metadata.lineStart ? `:${top.metadata.lineStart}-${top.metadata.lineEnd}` : ""}\n# Retrieved snippet:\n${top.text
      .split("\n")
      .map((l) => `  ${l}`)
      .join("\n")}`,
    testsToRun: ["Re-run the failing operation", "Run the existing unit/integration tests"],
    rollbackPlan: "No change applied automatically; nothing to roll back.",
  };
}

interface LlmPatchJson {
  filePath?: string;
  why?: string;
  riskLevel?: string;
  diff?: string;
  testsToRun?: string[];
  rollbackPlan?: string;
  insufficientEvidence?: boolean;
}

async function llmPatch(
  description: string,
  analysis: IssueAnalysis,
  codeChunks: RetrievedChunk[],
  apiKey: string
): Promise<CodePatch | null> {
  const allowedFiles = [...new Set(codeChunks.map((c) => c.metadata.filePath))];
  const context = codeChunks
    .map(
      (c) =>
        `FILE: ${c.metadata.filePath}${c.metadata.lineStart ? `:${c.metadata.lineStart}-${c.metadata.lineEnd}` : ""}\n${c.text.slice(0, 900)}`
    )
    .join("\n\n");

  const system = `You are a senior engineer proposing a minimal, safe code fix.
Rules:
- Only modify files in this allowed list: ${allowedFiles.join(", ")}.
- NEVER invent files, functions, imports, or APIs not present in the context.
- If the context is insufficient to propose a correct fix, set "insufficientEvidence": true and leave diff empty.
- Output JSON: { filePath, why, riskLevel ("low"|"medium"|"high"), diff (unified diff), testsToRun (string[]), rollbackPlan, insufficientEvidence (boolean) }.`;

  const user = `ISSUE: ${description}\nROOT CAUSE (from triage): ${analysis.rootCause}\n\nCODE CONTEXT:\n${context}`;

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  const raw = await chatJson<LlmPatchJson>(messages, apiKey, { temperature: 0.1, maxTokens: 1200 });

  if (raw.insufficientEvidence || !raw.filePath || !allowedFiles.includes(raw.filePath) || !raw.diff?.trim()) {
    return null;
  }
  return {
    filePath: raw.filePath,
    why: raw.why ?? "",
    riskLevel: raw.riskLevel === "high" || raw.riskLevel === "medium" ? raw.riskLevel : "low",
    diff: raw.diff,
    testsToRun: Array.isArray(raw.testsToRun) && raw.testsToRun.length ? raw.testsToRun : ["Run the test suite"],
    rollbackPlan: raw.rollbackPlan ?? "Revert the commit / redeploy the prior version.",
  };
}
