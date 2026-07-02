import "server-only";

import type { AgentResult, DocsFinding, SupportQuery } from "../investigation/types";
import { retrieveApiEndpointContext } from "../api-context";
import { buildSearchTerms } from "../investigation/extract-query";
import { resolveApiDocUrl } from "../cyware-doc-url";

export async function runDocsAgent(q: SupportQuery): Promise<AgentResult<DocsFinding>> {
  const start = Date.now();
  const terms = [buildSearchTerms(q), q.endpoint, q.errorMessage].filter(Boolean).join(" ");
  const chunks = retrieveApiEndpointContext(terms || q.text, 6);

  const docs = chunks.map((c, i) => ({
    id: `doc-${i}`,
    sourceType: "docs" as const,
    title: c.metadata.title ?? c.metadata.filePath,
    summary: c.text.slice(0, 400),
    url:
      c.metadata.url ??
      resolveApiDocUrl({
        title: c.metadata.title,
        method: String(c.metadata.http_method ?? ""),
        path: String(c.metadata.endpoint_path ?? ""),
        docUrl: typeof c.metadata.doc_url === "string" ? c.metadata.doc_url : undefined,
        sourceName: c.metadata.source_name,
        sourceUrl: c.metadata.source_url,
      }),
    metadata: {
      method: c.metadata.http_method,
      path: c.metadata.endpoint_path,
    },
  }));

  const usageCorrect =
    q.statusCode === 401 || q.statusCode === 403
      ? false
      : docs.length > 0
        ? undefined
        : undefined;

  let correctedExample: string | undefined;
  if (docs[0]?.metadata?.method && docs[0]?.metadata?.path) {
    correctedExample = `${docs[0].metadata.method} ${docs[0].metadata.path}`;
  }

  return {
    agent: "docs",
    ok: true,
    mock: false,
    warnings: docs.length === 0 ? ["No API docs matched — import Cyware specs or ingest API docs."] : [],
    durationMs: Date.now() - start,
    data: {
      docs,
      usageCorrect,
      correctedExample,
      summary:
        docs.length === 0
          ? "No API documentation chunks retrieved."
          : `Found ${docs.length} API doc endpoint(s) relevant to the query.`,
      mock: false,
    },
  };
}
