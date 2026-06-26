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
import { expandClientDescription } from "./expand-description";
import { getConfig, hasOpenAI } from "./config";
import { chatJson, type ChatMessage } from "./openai";
import { ingestRepo } from "./ingest";
import {
  detectCywareProducts,
  retrieveApiEndpointContext,
  mergeRetrievedChunks,
  buildCywareActionPlan,
  formatApiContextForLlm,
  mergeFixSteps,
  isVagueCustomerResponse,
  ticketNeedsCql,
} from "./api-context";
import { retrieveCqlDocs } from "./cql/generate";

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
  /** When false, skip mock/default repo RAG (Jira-only / Cyware API tickets). */
  repoUrlProvided?: boolean;
  /** Test mode: mock repo only, heuristic classifier (no LLM / no Cyware dilution). */
  evalMode?: boolean;
}): Promise<IssueAnalysis> {
  const { ref, description, issue, repoUrlProvided = true, evalMode = false } = opts;
  const cfg = getConfig();

  const clientText = expandClientDescription(description, issue);
  const query = [clientText, issue?.title, issue?.body].filter(Boolean).join("\n");

  if (evalMode) {
    const { chunks } = await retrieve(ref, query || "error", 12);
    const heuristic = classifyHeuristic(clientText, issue, chunks);
    return {
      ...heuristic,
      retrievedContext: chunks,
      usedLlm: false,
    };
  }

  const cywareProducts = detectCywareProducts(query);
  const limitPerSpec = cywareProducts.length > 1 ? 4 : 5;
  const apiChunks = retrieveApiEndpointContext(query, limitPerSpec);

  let cqlChunks: RetrievedChunk[] = [];
  if (ticketNeedsCql(query)) {
    try {
      cqlChunks = await retrieveCqlDocs(query, 3);
    } catch {
      /* CQL namespace may be empty */
    }
  }

  const actionPlan = buildCywareActionPlan(query, apiChunks, cqlChunks);

  // Also pull from the shared knowledge base (past resolutions / runbooks /
  // error logs) so recurring issues resolve with prior context cited.
  const { knowledgeNamespace } = await import("./knowledge");
  const { cqlNamespace } = await import("./cql/ingest-docs");
  const { listSpecs } = await import("./api-specs/registry");
  const { apiSpecNamespace } = await import("./api-specs");
  const extraNamespaces = [knowledgeNamespace(), cqlNamespace()];
  for (const spec of listSpecs()) {
    extraNamespaces.push(apiSpecNamespace(spec.id));
  }

  const topK = cywareProducts.length > 1 ? 22 : 12;
  let chunks: RetrievedChunk[] = [];
  if (repoUrlProvided) {
    ({ chunks } = await retrieve(ref, query || "error", topK, extraNamespaces));
    if (chunks.length === 0) {
      try {
        await ingestRepo({
          repoUrl: `${ref.owner}/${ref.name}`,
          includeIssues: true,
          includePRs: true,
        });
        ({ chunks } = await retrieve(ref, query || "error", topK, extraNamespaces));
      } catch {
        /* proceed */
      }
    }
  } else {
    const { retrieveAcross } = await import("./retrieve");
    ({ chunks } = await retrieveAcross(extraNamespaces, query || "error", topK));
  }

  chunks = mergeRetrievedChunks(chunks, [...apiChunks, ...cqlChunks], topK);

  const heuristic = classifyHeuristic(clientText, issue, chunks);

  if (!hasOpenAI(cfg) || !cfg.openaiApiKey) {
    const grounded = applyCywareGrounding(heuristic, actionPlan, chunks);
    return { ...grounded, retrievedContext: chunks, usedLlm: false };
  }

  try {
    const refined = await refineWithLlm(
      clientText,
      issue,
      chunks,
      heuristic,
      cfg.openaiApiKey,
      actionPlan
    );
    return { ...refined, retrievedContext: chunks, usedLlm: true };
  } catch {
    const grounded = applyCywareGrounding(heuristic, actionPlan, chunks);
    return { ...grounded, retrievedContext: chunks, usedLlm: false };
  }
}

function applyCywareGrounding(
  analysis: Omit<IssueAnalysis, "retrievedContext" | "usedLlm">,
  actionPlan: ReturnType<typeof buildCywareActionPlan>,
  chunks: RetrievedChunk[]
): Omit<IssueAnalysis, "retrievedContext" | "usedLlm"> {
  if (!actionPlan) return analysis;
  return {
    ...analysis,
    category: analysis.category === "unknown" ? "documentation" : analysis.category,
    fixability: actionPlan.fixSteps.length ? "support-can-fix" : analysis.fixability,
    fixSteps: actionPlan && actionPlan.fixSteps.length > 0 ? actionPlan.fixSteps : mergeFixSteps(analysis.fixSteps, actionPlan?.fixSteps ?? []),
    suggestedTicketResponse: isVagueCustomerResponse(analysis.suggestedTicketResponse)
      ? actionPlan.customerResponse
      : analysis.suggestedTicketResponse,
    citations: pickCitations(chunks, actionPlan.products.length > 1 ? 12 : 8),
  };
}

function pickCitations(chunks: RetrievedChunk[], n: number) {
  const apiFirst = [
    ...chunks.filter((c) => c.metadata.sourceType === "openapi" || c.metadata.sourceType === "postman"),
    ...chunks.filter((c) => c.metadata.sourceType !== "openapi" && c.metadata.sourceType !== "postman"),
  ];
  return apiFirst.slice(0, n).map(citationFromChunk);
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
  apiKey: string,
  actionPlan: ReturnType<typeof buildCywareActionPlan>
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

  const apiSummary = formatApiContextForLlm(
    chunks.filter((c) => c.metadata.sourceType === "openapi" || c.metadata.sourceType === "postman")
  );

  const allowedFiles = [
    ...new Set(
      chunks
        .filter((c) => c.metadata.sourceType === "code" || c.metadata.sourceType === "docs")
        .map((c) => c.metadata.filePath)
    ),
  ];

  const cywareRules = actionPlan
    ? `
CYWARE MULTI-PRODUCT RULES (this ticket references Cyware products):
- category MUST be "documentation" when the client needs API/how-to guidance.
- fixSteps MUST name exact HTTP METHOD + path from the API ENDPOINTS BY PRODUCT section (e.g. "GET /v1/playbook/playbook-result/filter/").
- NEVER write vague steps like "Provide the client with the API" or "Assist with CQL" — be specific.
- suggestedTicketResponse MUST be actionable: list the APIs grouped by product (Orchestrate, CTIX, CSAP, CFTR) that the client should call.
- When CQL docs are in context, reference how to filter indicators (type, confidence, date window).
`
    : "";

  const system = `You are an expert software support engineer triaging a client-reported issue.
You MUST ground every claim in the provided CONTEXT. NEVER invent files, functions, APIs, config values, issues, or PRs that are not in the context. If evidence is missing, say so and lower confidence.
Only reference file paths from this allowed list: ${allowedFiles.join(", ") || "(none retrieved)"}.
Only propose a codeFix when the context clearly supports it; otherwise set codeFix to null.
${cywareRules}
Return a single JSON object with these exact keys:
- summary (string, plain English)
- rootCause (string)
- confidence ("High" | "Medium" | "Low")
- evidence (string[] — each item MUST be a full sentence explaining the finding AND cite [#n] context items; never return bare "[#1]" alone)
- category (one of: ${CATEGORIES.join(", ")})
- fixability (one of: ${FIXABILITIES.join(", ")})
- fixSteps (string[])
- codeFix (object with filePath, why, riskLevel "low"|"medium"|"high", diff, testsToRun string[], rollbackPlan — or null)
- questionsForClient (string[])
- suggestedTicketResponse (string, customer-facing, actionable — include specific API paths when Cyware context is present)
- escalationNote (string or null — only when engineering is required)`;

  const user = `CLIENT DESCRIPTION:
${description || "(none provided)"}

${issue ? `LINKED TICKET ${issue.id}: ${issue.title}\nState: ${issue.state} | Labels: ${issue.labels.join(", ")}\n${issue.body}\n` : ""}
HEURISTIC PRIOR (a deterministic first pass; correct it if the context disagrees):
category=${prior.category}, fixability=${prior.fixability}, confidence=${prior.confidence}

${
  actionPlan
    ? `API ENDPOINTS BY PRODUCT (use these exact paths in fixSteps and suggestedTicketResponse):
${apiSummary || formatApiContextForLlm(chunks)}

DETERMINISTIC FIX STEPS (prefer these unless context contradicts):
${actionPlan.fixSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}
`
    : ""
}
CONTEXT (retrieved repo + ticket chunks):
${context || "(no context retrieved)"}`;

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const raw = await chatJson<LlmAnalysis>(messages, apiKey, {
    temperature: 0.2,
    maxTokens: actionPlan ? 2400 : 1800,
  });

  const confidence = CONFIDENCES.includes(raw.confidence as Confidence)
    ? (raw.confidence as Confidence)
    : prior.confidence;
  let fixability = FIXABILITIES.includes(raw.fixability as Fixability)
    ? (raw.fixability as Fixability)
    : prior.fixability;
  let category = CATEGORIES.includes(raw.category as IssueCategory)
    ? (raw.category as IssueCategory)
    : prior.category;

  if (actionPlan) {
    category = category === "unknown" ? "documentation" : category;
    if (fixability === "not-enough-info" && actionPlan.fixSteps.length) fixability = "support-can-fix";
  }

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

  const fixSteps =
    actionPlan && actionPlan.fixSteps.length > 0
      ? actionPlan.fixSteps
      : mergeFixSteps(clean(raw.fixSteps), actionPlan?.fixSteps ?? []);

  let suggestedTicketResponse = raw.suggestedTicketResponse?.trim() || prior.suggestedTicketResponse;
  if (actionPlan && isVagueCustomerResponse(suggestedTicketResponse)) {
    suggestedTicketResponse = actionPlan.customerResponse;
  } else if (actionPlan && actionPlan.fixSteps.length) {
    // Prefer deterministic customer response when LLM cites wrong CFTR GET instead of POST create.
    const llm = suggestedTicketResponse.toLowerCase();
    if (llm.includes("get {{base_url}}v1/incident") && !llm.includes("post")) {
      suggestedTicketResponse = actionPlan.customerResponse;
    }
  }

  return {
    summary: raw.summary?.trim() || prior.summary,
    rootCause: raw.rootCause?.trim() || prior.rootCause,
    confidence,
    evidence: clean(raw.evidence) ?? prior.evidence,
    fixability,
    category,
    fixSteps,
    codeFix,
    questionsForClient: clean(raw.questionsForClient) ?? prior.questionsForClient,
    suggestedTicketResponse,
    escalationNote:
      fixability === "engineering-required"
        ? raw.escalationNote?.trim() || prior.escalationNote
        : raw.escalationNote?.trim() || null,
    citations: pickCitations(chunks, actionPlan && actionPlan.products.length > 1 ? 12 : 8),
  };
}

function clean(arr: string[] | undefined): string[] | null {
  if (!Array.isArray(arr)) return null;
  const out = arr.map((s) => String(s).trim()).filter(Boolean);
  return out.length ? out : null;
}
