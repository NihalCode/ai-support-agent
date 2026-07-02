import "server-only";

import type { AgentResult, SupportQuery } from "../investigation/types";
import { retrieveCqlDocs, generateCql } from "../cql/generate";
import { validateCqlStructure } from "../cql/validate";
import { cqlDocUrl } from "../cyware-doc-url";

export interface CqlFinding {
  queries: { id: string; cql: string; valid: boolean; explanation: string }[];
  docsSnippets: { title: string; summary: string; url?: string; pageUrl?: string }[];
  summary: string;
  mock: boolean;
}

export async function runCqlAgent(q: SupportQuery): Promise<AgentResult<CqlFinding>> {
  const start = Date.now();
  const needsCql =
    /\bcql\b/i.test(q.text) ||
    /\b(malicious|indicator.*query|confidence|filter)\b/i.test(q.text) ||
    /\bquery language\b/i.test(q.text);

  const chunks = await retrieveCqlDocs(q.text, 6);
  const docsSnippets = chunks.map((c) => ({
    title: c.metadata.title ?? c.metadata.filePath ?? "CQL doc",
    summary: c.text.slice(0, 300),
    url: cqlDocUrl({
      url: c.metadata.url,
      pageUrl: typeof c.metadata.cyware_doc_page === "string" ? c.metadata.cyware_doc_page : undefined,
      heading: c.metadata.cyware_doc_section ?? c.metadata.title,
    }),
    pageUrl:
      typeof c.metadata.cyware_doc_page === "string" ? c.metadata.cyware_doc_page : undefined,
  }));

  const queries: CqlFinding["queries"] = [];
  if (needsCql || q.text.length > 20) {
    try {
      const generated = await generateCql(q.text);
      if (generated.cql) {
        const validation = validateCqlStructure(generated.cql);
        queries.push({
          id: "cql-generated",
          cql: generated.cql,
          valid: validation.valid,
          explanation: generated.explanation || validation.issues.join("; ") || "",
        });
      }
    } catch {
      /* optional */
    }
  }

  const cqlInText = q.text.match(/type\s*=\s*"[^"]+"[^.\n]{0,200}/i)?.[0];
  if (cqlInText) {
    const validation = validateCqlStructure(cqlInText);
    queries.push({
      id: "cql-from-query",
      cql: cqlInText,
      valid: validation.valid,
      explanation: validation.issues.join("; ") || "",
    });
  }

  return {
    agent: "cql",
    ok: true,
    mock: chunks.length === 0,
    warnings: chunks.length === 0 ? ["CQL docs not indexed — run bootstrap or POST /api/support/cql"] : [],
    durationMs: Date.now() - start,
    data: {
      queries,
      docsSnippets,
      summary:
        queries.length > 0
          ? `${queries.length} CQL suggestion(s); ${docsSnippets.length} doc snippet(s).`
          : docsSnippets.length
            ? `Found ${docsSnippets.length} CQL doc snippet(s) — no generated query yet.`
            : "No CQL context — index CQL docs for query generation.",
      mock: chunks.length === 0,
    },
  };
}
