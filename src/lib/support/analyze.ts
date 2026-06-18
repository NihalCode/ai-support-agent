import "server-only";

import type {
  IssueAnalysis,
  NormalizedIssue,
  RepoRef,
  RetrievedChunk,
  Confidence,
  Fixability,
  IssueCategory,
} from "./types";
import { retrieve, citationFromChunk } from "./retrieve";
import { classifyHeuristic } from "./classify";
import { getConfig, hasOpenAI } from "./config";
import { chatJson, type ChatMessage } from "./openai";
import { ingestRepo } from "./ingest";

/**
 * Issue analysis service. Retrieves repo + ticket context, runs the
 * deterministic heuristic engine, and (when OpenAI is configured) asks the LLM
 * to refine the triage into the structured A–K report — strictly grounded in
 * the retrieved context. Falls back to the heuristic output otherwise.
 */
export async function analyzeIssue(opts: {
  ref: RepoRef;
  description: string;
  issue?: NormalizedIssue | null;
}): Promise<IssueAnalysis> {
  const { ref, description, issue } = opts;
  const cfg = getConfig();

  const query = [description, issue?.title, issue?.body].filter(Boolean).join("\n");
  let { chunks } = await retrieve(ref, query || "error", 12);

  // Lazy ingest: if this repo hasn't been indexed yet, ingest it on demand so
  // the very first analysis still has RAG context to ground itself in.
  if (chunks.length === 0) {
    try {
      await ingestRepo({
        repoUrl: `${ref.owner}/${ref.name}`,
        includeIssues: true,
        includePRs: true,
      });
      ({ chunks } = await retrieve(ref, query || "error", 12));
    } catch {
      // proceed with no context — analysis degrades gracefully
    }
  }

  const heuristic = classifyHeuristic(description, issue, chunks);

  if (!hasOpenAI(cfg) || !cfg.openaiApiKey) {
    return { ...heuristic, retrievedContext: chunks, usedLlm: false };
  }

  try {
    const refined = await refineWithLlm(description, issue, chunks, heuristic, cfg.openaiApiKey);
    return { ...refined, retrievedContext: chunks, usedLlm: true };
  } catch {
    // LLM failed — return the trustworthy heuristic result.
    return { ...heuristic, retrievedContext: chunks, usedLlm: false };
  }
}

interface LlmAnalysis {
  summary?: string;
  rootCause?: string;
  confidence?: string;
  evidence?: string[];
  fixability?: string;
  category?: string;
  fixSteps?: string[];
  codeFix?: {
    filePath?: string;
    why?: string;
    riskLevel?: string;
    diff?: string;
    testsToRun?: string[];
    rollbackPlan?: string;
  } | null;
  questionsForClient?: string[];
  suggestedTicketResponse?: string;
  escalationNote?: string | null;
}

const CONFIDENCES: Confidence[] = ["High", "Medium", "Low"];
const FIXABILITIES: Fixability[] = [
  "client-can-fix",
  "support-can-fix",
  "engineering-required",
  "not-enough-info",
  "not-doable",
];
const CATEGORIES: IssueCategory[] = [
  "user-error",
  "documentation",
  "known-bug",
  "new-bug",
  "feature-request",
  "unsupported",
  "permissions",
  "environment",
  "unknown",
];

async function refineWithLlm(
  description: string,
  issue: NormalizedIssue | null | undefined,
  chunks: RetrievedChunk[],
  prior: ReturnType<typeof classifyHeuristic>,
  apiKey: string
): Promise<Omit<IssueAnalysis, "retrievedContext" | "usedLlm">> {
  const context = chunks
    .map((c, i) => {
      const m = c.metadata;
      const loc =
        m.sourceType === "code" || m.sourceType === "docs"
          ? `${m.filePath}${m.lineStart ? `:${m.lineStart}-${m.lineEnd}` : ""}`
          : `${m.sourceType.toUpperCase()} ${m.filePath} (${m.title ?? ""})`;
      return `[#${i + 1}] (${m.sourceType}) ${loc}\n${c.text.slice(0, 700)}`;
    })
    .join("\n\n");

  const allowedFiles = [
    ...new Set(
      chunks
        .filter((c) => c.metadata.sourceType === "code" || c.metadata.sourceType === "docs")
        .map((c) => c.metadata.filePath)
    ),
  ];

  const system = `You are an expert software support engineer triaging a client-reported issue.
You MUST ground every claim in the provided CONTEXT. NEVER invent files, functions, APIs, config values, issues, or PRs that are not in the context. If evidence is missing, say so and lower confidence.
Only reference file paths from this allowed list: ${allowedFiles.join(", ") || "(none retrieved)"}.
Only propose a codeFix when the context clearly supports it; otherwise set codeFix to null.
Return a single JSON object with these exact keys:
- summary (string, plain English)
- rootCause (string)
- confidence ("High" | "Medium" | "Low")
- evidence (string[] — cite [#n] context items)
- category (one of: ${CATEGORIES.join(", ")})
- fixability (one of: ${FIXABILITIES.join(", ")})
- fixSteps (string[])
- codeFix (object with filePath, why, riskLevel "low"|"medium"|"high", diff, testsToRun string[], rollbackPlan — or null)
- questionsForClient (string[])
- suggestedTicketResponse (string, customer-facing)
- escalationNote (string or null — only when engineering is required)`;

  const user = `CLIENT DESCRIPTION:
${description || "(none provided)"}

${issue ? `LINKED TICKET ${issue.id}: ${issue.title}\nState: ${issue.state} | Labels: ${issue.labels.join(", ")}\n${issue.body}\n` : ""}
HEURISTIC PRIOR (a deterministic first pass; correct it if the context disagrees):
category=${prior.category}, fixability=${prior.fixability}, confidence=${prior.confidence}

CONTEXT (retrieved repo + ticket chunks):
${context || "(no context retrieved)"}`;

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const raw = await chatJson<LlmAnalysis>(messages, apiKey, { temperature: 0.2, maxTokens: 1800 });

  const confidence = CONFIDENCES.includes(raw.confidence as Confidence)
    ? (raw.confidence as Confidence)
    : prior.confidence;
  const fixability = FIXABILITIES.includes(raw.fixability as Fixability)
    ? (raw.fixability as Fixability)
    : prior.fixability;
  const category = CATEGORIES.includes(raw.category as IssueCategory)
    ? (raw.category as IssueCategory)
    : prior.category;

  // Guard: drop any codeFix that references a file not in the retrieved set.
  let codeFix = prior.codeFix;
  if (raw.codeFix && raw.codeFix.filePath) {
    const fp = raw.codeFix.filePath;
    if (allowedFiles.includes(fp)) {
      codeFix = {
        filePath: fp,
        why: raw.codeFix.why ?? "",
        riskLevel:
          raw.codeFix.riskLevel === "high" || raw.codeFix.riskLevel === "medium"
            ? raw.codeFix.riskLevel
            : "low",
        diff: raw.codeFix.diff ?? "",
        testsToRun: raw.codeFix.testsToRun ?? [],
        rollbackPlan: raw.codeFix.rollbackPlan ?? "Revert the change / redeploy the prior version.",
      };
    }
  }

  return {
    summary: raw.summary?.trim() || prior.summary,
    rootCause: raw.rootCause?.trim() || prior.rootCause,
    confidence,
    evidence: clean(raw.evidence) ?? prior.evidence,
    fixability,
    category,
    fixSteps: clean(raw.fixSteps) ?? prior.fixSteps,
    codeFix,
    questionsForClient: clean(raw.questionsForClient) ?? prior.questionsForClient,
    suggestedTicketResponse: raw.suggestedTicketResponse?.trim() || prior.suggestedTicketResponse,
    escalationNote:
      fixability === "engineering-required"
        ? raw.escalationNote?.trim() || prior.escalationNote
        : raw.escalationNote?.trim() || null,
    citations: chunks.slice(0, 8).map(citationFromChunk),
  };
}

function clean(arr: string[] | undefined): string[] | null {
  if (!Array.isArray(arr)) return null;
  const out = arr.map((s) => String(s).trim()).filter(Boolean);
  return out.length ? out : null;
}
