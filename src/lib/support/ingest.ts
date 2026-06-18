import "server-only";

import type { IngestResult, SupportChunk, RepoRef } from "./types";
import {
  getRepoConnector,
  getGitHubTickets,
  getJiraTickets,
  resolveRepoRef,
} from "./connectors";
import { chunkFile, chunkIssue, chunkCommit } from "./chunk";
import { embedBatch } from "./embed";
import { getVectorStore, namespaceFor } from "./vector-store";
import { hasJira, getConfig } from "./config";

/**
 * Repo ingestion service: fetch repo files + README + commits + issues/PRs +
 * Jira tickets, chunk them, embed, and upsert into the vector store under a
 * per-repo namespace.
 */
export async function ingestRepo(opts: {
  repoUrl?: string;
  includeIssues?: boolean;
  includePRs?: boolean;
}): Promise<IngestResult> {
  const warnings: string[] = [];
  const { ref, mock: repoUrlMock } = resolveRepoRef(opts.repoUrl);
  const branch = ref.branch ?? "main";
  const repo = `${ref.owner}/${ref.name}`;
  const namespace = namespaceFor(repo, branch);

  const { connector: repoConn, mock: repoMock } = getRepoConnector();
  const store = getVectorStore();
  const cfg = getConfig();

  const chunks: SupportChunk[] = [];

  // --- Code + docs ---
  let files: Awaited<ReturnType<typeof repoConn.listFiles>>;
  try {
    files = await repoConn.listFiles(ref);
  } catch (e) {
    warnings.push(`Repo file listing failed: ${(e as Error).message}`);
    files = [];
  }
  for (const file of files) {
    try {
      chunks.push(...chunkFile(file, ref));
    } catch {
      warnings.push(`Chunking failed for ${file.path}`);
    }
  }
  // README explicitly (in case it wasn't in the tree slice).
  if (!files.some((f) => /^readme/i.test(f.path))) {
    const readme = await repoConn.getReadme(ref).catch(() => null);
    if (readme) chunks.push(...chunkFile(readme, ref));
  }

  // --- Commits ---
  try {
    const commits = await repoConn.listCommits(ref, 30);
    for (const c of commits) chunks.push(chunkCommit(c, ref));
  } catch (e) {
    warnings.push(`Commit history unavailable: ${(e as Error).message}`);
  }

  // --- GitHub issues + PRs ---
  let ticketsMock = false;
  if (opts.includeIssues !== false) {
    const { connector: ghTickets, mock } = getGitHubTickets(ref);
    ticketsMock = mock;
    try {
      // Broad search to seed the index with existing issues/PRs.
      const issues = await ghTickets.searchIssues("is:issue OR is:pr", 30);
      const seeded = issues.length
        ? issues
        : await ghTickets.searchIssues("bug error fix", 20);
      for (const issue of seeded) chunks.push(chunkIssue(issue, ref));
    } catch (e) {
      warnings.push(`GitHub issue ingestion limited: ${(e as Error).message}`);
    }
  }

  // --- Jira tickets ---
  const { connector: jiraTickets, mock: jiraMock } = getJiraTickets();
  if (hasJira(cfg) || jiraMock) {
    try {
      const tickets = await jiraTickets.searchIssues("bug error issue", 30);
      for (const t of tickets) chunks.push(chunkIssue(t, ref));
    } catch (e) {
      warnings.push(`Jira ingestion limited: ${(e as Error).message}`);
    }
  }

  // --- Embed + upsert ---
  const { vectors, usedOpenAI } = await embedBatch(chunks.map((c) => c.text));
  chunks.forEach((c, i) => (c.embedding = vectors[i]));
  if (!usedOpenAI) warnings.push("OpenAI key not set — used local hashing embeddings.");

  let upserted = 0;
  try {
    upserted = await store.upsert(namespace, chunks);
  } catch (e) {
    warnings.push(`Vector upsert failed: ${(e as Error).message}`);
  }

  const bySource: Record<string, number> = {};
  for (const c of chunks) {
    bySource[c.metadata.sourceType] = (bySource[c.metadata.sourceType] ?? 0) + 1;
  }

  return {
    repo,
    branch,
    namespace,
    chunks: chunks.length,
    upserted,
    bySource,
    usedMock: {
      repo: repoMock || repoUrlMock,
      tickets: ticketsMock,
      vectorStore: store.isMock,
    },
    warnings,
  };
}

export function namespaceForRepo(ref: RepoRef): string {
  return namespaceFor(`${ref.owner}/${ref.name}`, ref.branch ?? "main");
}
