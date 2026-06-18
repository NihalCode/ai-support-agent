import "server-only";

import type {
  CqlResult,
  RetrievedChunk,
  AnalysisCitation,
  EndpointEffect,
} from "../types";
import { getConfig, hasOpenAI } from "../config";
import { embedQueryText } from "../embed";
import { getVectorStore } from "../vector-store";
import { chatJson, type ChatMessage } from "../openai";
import { citationFromChunk } from "../retrieve";
import { cqlNamespace } from "./ingest-docs";
import { validateCqlStructure } from "./validate";
import { listSpecs } from "../api-specs/registry";
import { rankEndpoints } from "../api-specs";

/**
 * Natural-language → CQL generation, grounded strictly in indexed CQL docs.
 * If the docs are not indexed or don't contain enough syntax, the result's
 * `cql` is null and `missingInfo` explains what's missing — we never invent
 * CQL syntax.
 */

const WRITE_INTENT = /\b(add|create|apply|attach|tag|update|set|modify|assign|relat|link|enrich)\b/i;

export async function retrieveCqlDocs(query: string, topK = 6): Promise<RetrievedChunk[]> {
  const { vector } = await embedQueryText(query);
  const store = getVectorStore();
  return store.query(cqlNamespace(), vector, topK);
}

export async function generateCql(query: string): Promise<CqlResult> {
  const cfg = getConfig();
  const effect: EndpointEffect = WRITE_INTENT.test(query) ? "write" : "read";
  const docs = await retrieveCqlDocs(query);
  const citations: AnalysisCitation[] = docs.map(citationFromChunk);
  const endpoint = mapToEndpoint(query, effect);

  const baseResult: CqlResult = {
    intent: query.trim(),
    cql: null,
    explanation: "",
    apiEndpoint: endpoint?.path,
    httpMethod: endpoint?.method,
    queryParams: endpoint?.queryParams,
    payload: endpoint?.payload,
    effect,
    requiresApproval: effect !== "read",
    expectedResult: "",
    citations,
    usedLlm: false,
  };

  if (docs.length === 0) {
    return {
      ...baseResult,
      explanation: "CQL documentation has not been indexed yet.",
      missingInfo: [
        "The CQL documentation is not indexed. Index it first (POST /api/support/cql {intent:'index'}), then retry.",
      ],
    };
  }

  if (!hasOpenAI(cfg) || !cfg.openaiApiKey) {
    return {
      ...baseResult,
      explanation:
        "Found relevant CQL documentation, but the language model is not configured, so a CQL query cannot be safely generated without risking invented syntax.",
      missingInfo: [
        "OPENAI_API_KEY is not set. CQL generation requires an LLM grounded in the indexed docs to avoid hallucinating syntax.",
      ],
    };
  }

  const context = docs
    .map((d, i) => `[CQL DOC ${i + 1}] ${d.metadata.cyware_doc_section ?? d.metadata.title ?? ""}\n${d.text}`)
    .join("\n\n");

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You convert a natural-language threat-intel request into a Cyware Query Language (CQL) query. " +
        "Use ONLY operators, field names, and syntax that appear in the provided CQL DOC context. " +
        "Do NOT invent fields or operators. If the context lacks the syntax needed to express the request, " +
        'return cql as null and list precisely what is missing in "missingInfo". ' +
        'Respond as JSON: {"cql": string|null, "explanation": string, "fieldsUsed": string[], "expectedResult": string, "missingInfo": string[]}.',
    },
    {
      role: "user",
      content: `CQL DOC context:\n${context}\n\nRequest: "${query}"\n\nGenerate the CQL grounded strictly in the context above.`,
    },
  ];

  try {
    const llm = await chatJson<{
      cql: string | null;
      explanation?: string;
      fieldsUsed?: string[];
      expectedResult?: string;
      missingInfo?: string[];
    }>(messages, cfg.openaiApiKey, { temperature: 0 });

    const missingInfo = Array.isArray(llm.missingInfo) ? llm.missingInfo.filter(Boolean) : [];
    const cql = typeof llm.cql === "string" && llm.cql.trim() ? llm.cql.trim() : null;

    if (cql) {
      const validation = validateCqlStructure(cql);
      if (!validation.valid) {
        missingInfo.push(...validation.issues.map((i) => `Validation: ${i}`));
      }
    }

    return {
      ...baseResult,
      cql,
      explanation:
        llm.explanation ??
        (cql ? "Generated from the indexed CQL documentation." : "Could not generate a grounded CQL query."),
      expectedResult: llm.expectedResult ?? (effect === "read" ? "A list of matching threat-intel objects." : "Objects matched, then the write action applied after approval."),
      missingInfo: missingInfo.length ? missingInfo : undefined,
      usedLlm: true,
    };
  } catch (err) {
    return {
      ...baseResult,
      explanation: "CQL generation failed.",
      missingInfo: [err instanceof Error ? err.message : "LLM call failed"],
      usedLlm: true,
    };
  }
}

/** Map a CQL request to a likely API endpoint among registered specs (best-effort). */
function mapToEndpoint(
  query: string,
  effect: EndpointEffect
): { path: string; method: string; queryParams?: Record<string, string>; payload?: unknown } | undefined {
  const specs = listSpecs();
  if (specs.length === 0) return undefined;
  const intent = effect === "write" ? `${query} create update tag` : `${query} search list query indicators`;
  for (const spec of specs) {
    const ranked = rankEndpoints(spec, intent, 1);
    if (ranked.length) {
      const ep = ranked[0];
      return {
        path: ep.path,
        method: ep.method,
        queryParams: ep.queryParams.length ? Object.fromEntries(ep.queryParams.map((p) => [p.name, ""])) : undefined,
        payload: ep.requestBodySchema,
      };
    }
  }
  return undefined;
}
