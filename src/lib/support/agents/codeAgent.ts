import "server-only";

import type { AgentResult, CodeFinding, EvidenceItem, SupportQuery } from "../investigation/types";
import { resolveRepoRef } from "../connectors";
import { retrieve } from "../retrieve";
import { citationFromChunk } from "../retrieve";
import { buildSearchTerms } from "../investigation/extract-query";
import { ingestRepo } from "../ingest";
import { retrieveApiEndpointContext } from "../api-context";

export async function runCodeAgent(q: SupportQuery): Promise<AgentResult<CodeFinding>> {
  const start = Date.now();
  const warnings: string[] = [];
  const { ref, mock: repoMock } = resolveRepoRef(q.repoUrl);
  const terms = buildSearchTerms(q);
  let { chunks, usedMockStore } = await retrieve(ref, terms || q.text, 10);

  let codeChunks = chunks.filter((c) => c.metadata.sourceType === "code");
  if (codeChunks.length === 0 && !repoMock) {
    try {
      await ingestRepo({
        repoUrl: `${ref.owner}/${ref.name}`,
        includeIssues: true,
        includePRs: true,
      });
      ({ chunks, usedMockStore } = await retrieve(ref, terms || q.text, 10));
      codeChunks = chunks.filter((c) => c.metadata.sourceType === "code");
      if (codeChunks.length > 0) warnings.push("Auto-ingested repo into RAG for code search.");
    } catch {
      /* proceed with empty */
    }
  }
  const commitChunks = chunks.filter((c) => c.metadata.sourceType === "commit");
  const prChunks = chunks.filter((c) => c.metadata.sourceType === "pr" || c.metadata.sourceType === "issue");

  let files: EvidenceItem[] = codeChunks.map((c, i) => {
    const cit = citationFromChunk(c);
    return {
      id: `code-${i}`,
      sourceType: "code" as const,
      title: cit.label,
      summary: c.text.slice(0, 400),
      url: cit.url,
      metadata: {
        filePath: c.metadata.filePath,
        lineStart: c.metadata.lineStart,
        lineEnd: c.metadata.lineEnd,
      },
    };
  });

  const commits = commitChunks.slice(0, 5).map((c, i) => ({
    id: `commit-${i}`,
    sourceType: "commit" as const,
    title: c.metadata.title ?? c.metadata.filePath,
    summary: c.text.slice(0, 300),
    url: c.metadata.url,
  }));

  const pullRequests = prChunks.slice(0, 5).map((c, i) => ({
    id: `pr-${i}`,
    sourceType: "pr" as const,
    title: c.metadata.title ?? c.metadata.filePath,
    summary: c.text.slice(0, 300),
    url: c.metadata.url,
  }));

  let codePathSummary: string | undefined;
  if (files.length > 0) {
    codePathSummary = `Relevant code in ${files[0].metadata?.filePath ?? files[0].title}${q.endpoint ? ` may implement ${q.endpoint}` : ""}.`;
  } else if (q.endpoint) {
    const apiChunks = retrieveApiEndpointContext(terms || q.endpoint, 3);
    if (apiChunks.length > 0) {
      for (const [i, c] of apiChunks.entries()) {
        const cit = citationFromChunk(c);
        files.push({
          id: `api-spec-${i}`,
          sourceType: "docs" as const,
          title: cit.label,
          summary: c.text.slice(0, 400),
          url: cit.url,
          metadata: {
            filePath: c.metadata.filePath,
            method: c.metadata.http_method,
            path: c.metadata.endpoint_path,
          },
        });
      }
      codePathSummary = `${q.endpoint} is a CTIX API route (see ${files[0]?.title ?? "API spec"}) — backend lives in the CTIX tenant, not the linked GitHub repo.`;
    }
  }

  if (repoMock) warnings.push("GitHub mock repo — provide GITHUB_TOKEN + repo URL for live code search.");
  if (usedMockStore) warnings.push("In-memory vector store — ingest repo for richer code RAG.");

  return {
    agent: "code",
    ok: true,
    mock: repoMock,
    warnings,
    durationMs: Date.now() - start,
    data: {
      files,
      commits,
      pullRequests,
      codePathSummary,
      summary:
        files.length > 0
          ? files.some((f) => f.sourceType === "docs")
            ? `No app repo match — ${files.length} API spec reference(s) for ${q.endpoint ?? "this endpoint"}.`
            : `Found ${files.length} code file(s), ${commits.length} commit(s), ${pullRequests.length} PR/issue reference(s).`
          : "No matching code or API spec — ingest the repo or import Cyware API specs.",
      mock: repoMock,
    },
  };
}
