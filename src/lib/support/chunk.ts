import type {
  RepoFile,
  NormalizedIssue,
  KnowledgeDocument,
  CommitInfo,
  SupportChunk,
  ChunkMetadata,
  RepoRef,
} from "./types";
import { isConfigFile, isDocFile } from "./languages";

/**
 * Intelligent chunking. Code is split by top-level function/class/route
 * declarations (with line ranges); docs by markdown heading sections; config
 * files are kept whole; issues/PRs/tickets become one chunk each (title + body
 * + comments). Every chunk carries rich metadata for citations + filtering.
 */

const MAX_CHARS = 1600;
const OVERLAP_LINES = 3;

function repoSlug(ref: RepoRef): string {
  return `${ref.owner}/${ref.name}`;
}

// Matches function/class/route-ish declarations across common languages.
const SYMBOL_RE =
  /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:public\s+|private\s+|protected\s+)?(?:function|class|interface|type|const|def|func|fn|public|private|router\.(?:get|post|put|delete|patch)|app\.(?:get|post|put|delete|patch))\b[^\n]*/;

function symbolName(line: string): string | undefined {
  const m = line.match(
    /(?:function|class|interface|type|def|func|fn)\s+([A-Za-z0-9_]+)/
  );
  if (m) return m[1];
  const c = line.match(/(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=/);
  if (c) return c[1];
  const route = line.match(/(?:router|app)\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)/);
  if (route) return `${route[1].toUpperCase()} ${route[2]}`;
  return undefined;
}

function pushChunk(
  chunks: SupportChunk[],
  text: string,
  meta: ChunkMetadata
) {
  const trimmed = text.trim();
  if (!trimmed) return;
  const now = new Date().toISOString();
  // Populate generalized RAG metadata so every chunk is consistently filterable.
  const enriched: ChunkMetadata = {
    ...meta,
    source_name: meta.source_name ?? meta.repo,
    file_path: meta.file_path ?? meta.filePath,
    line_range: meta.line_range ?? (meta.lineStart ? `${meta.lineStart}-${meta.lineEnd ?? meta.lineStart}` : undefined),
    created_at: meta.created_at ?? now,
    updated_at: meta.updated_at ?? now,
  };
  const idBase = `${meta.repo}:${meta.branch}:${meta.sourceType}:${meta.filePath}:${meta.lineStart ?? 0}:${meta.symbol ?? ""}`;
  chunks.push({ id: idBase.replace(/\s+/g, "_"), text: trimmed, metadata: enriched });
}

function chunkCodeFile(file: RepoFile, ref: RepoRef): SupportChunk[] {
  const chunks: SupportChunk[] = [];
  const lines = file.content.split("\n");
  const repo = repoSlug(ref);
  const branch = ref.branch ?? "main";

  // Find symbol boundaries.
  const boundaries: { line: number; symbol?: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (SYMBOL_RE.test(lines[i])) {
      boundaries.push({ line: i, symbol: symbolName(lines[i]) });
    }
  }
  if (boundaries.length === 0 || boundaries[0].line > 0) {
    boundaries.unshift({ line: 0 });
  }

  for (let b = 0; b < boundaries.length; b++) {
    const start = boundaries[b].line;
    const end = b + 1 < boundaries.length ? boundaries[b + 1].line : lines.length;
    let segment = lines.slice(Math.max(0, start - (b > 0 ? OVERLAP_LINES : 0)), end).join("\n");
    const symbol = boundaries[b].symbol;

    // Sub-split oversized segments.
    if (segment.length <= MAX_CHARS) {
      pushChunk(chunks, segment, {
        repo,
        branch,
        filePath: file.path,
        language: file.language,
        symbol,
        lineStart: start + 1,
        lineEnd: end,
        lastCommit: file.lastCommit,
        sourceType: isDocFile(file.path) ? "docs" : "code",
      });
    } else {
      let offset = start;
      while (segment.length > 0) {
        const slice = segment.slice(0, MAX_CHARS);
        const sliceLines = slice.split("\n").length;
        pushChunk(chunks, slice, {
          repo,
          branch,
          filePath: file.path,
          language: file.language,
          symbol,
          lineStart: offset + 1,
          lineEnd: offset + sliceLines,
          lastCommit: file.lastCommit,
          sourceType: "code",
        });
        offset += sliceLines;
        segment = segment.slice(MAX_CHARS);
      }
    }
  }
  return chunks;
}

function chunkDocFile(file: RepoFile, ref: RepoRef): SupportChunk[] {
  const chunks: SupportChunk[] = [];
  const repo = repoSlug(ref);
  const branch = ref.branch ?? "main";
  const lines = file.content.split("\n");

  let sectionStart = 0;
  let heading = file.path;
  const flush = (end: number) => {
    const text = lines.slice(sectionStart, end).join("\n");
    if (text.trim()) {
      pushChunk(chunks, `${heading}\n\n${text}`, {
        repo,
        branch,
        filePath: file.path,
        language: "markdown",
        symbol: heading.replace(/^#+\s*/, ""),
        lineStart: sectionStart + 1,
        lineEnd: end,
        lastCommit: file.lastCommit,
        sourceType: "docs",
        title: heading.replace(/^#+\s*/, ""),
      });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,4}\s+/.test(lines[i]) && i > sectionStart) {
      flush(i);
      sectionStart = i;
      heading = lines[i];
    } else if (/^#{1,4}\s+/.test(lines[i])) {
      heading = lines[i];
    }
  }
  flush(lines.length);
  return chunks;
}

export function chunkFile(file: RepoFile, ref: RepoRef): SupportChunk[] {
  const repo = repoSlug(ref);
  const branch = ref.branch ?? "main";
  if (isConfigFile(file.path)) {
    // Keep config files whole (truncated) — they're read as a unit.
    return [
      {
        id: `${repo}:${branch}:config:${file.path}`.replace(/\s+/g, "_"),
        text: `${file.path}\n\n${file.content.slice(0, 4000)}`,
        metadata: {
          repo,
          branch,
          filePath: file.path,
          language: file.language,
          sourceType: "code",
          symbol: "config",
        },
      },
    ];
  }
  if (isDocFile(file.path)) return chunkDocFile(file, ref);
  return chunkCodeFile(file, ref);
}

export function chunkIssue(issue: NormalizedIssue, ref: RepoRef): SupportChunk {
  const repo = repoSlug(ref);
  const branch = ref.branch ?? "main";
  const commentText = issue.comments
    .map((c) => `@${c.author}: ${c.body}`)
    .join("\n");
  const text = [
    `${issue.source.toUpperCase()} ${issue.id}: ${issue.title}`,
    `State: ${issue.state} | Labels: ${issue.labels.join(", ") || "none"}`,
    issue.body,
    commentText ? `Comments:\n${commentText}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const sourceType =
    issue.source === "jira"
      ? "jira"
      : issue.source === "zendesk"
        ? "zendesk"
        : issue.state === "merged"
          ? "pr"
          : "issue";
  const now = new Date().toISOString();
  return {
    id: `${repo}:${branch}:${sourceType}:${issue.id}`.replace(/\s+/g, "_"),
    text,
    metadata: {
      repo,
      branch,
      filePath: issue.id,
      language: "n/a",
      sourceType,
      title: issue.title,
      url: issue.url,
      source_name: repo,
      source_url: issue.url,
      jira_ticket_id: issue.source === "jira" ? issue.id : undefined,
      github_issue_id: issue.source === "github" ? issue.id : undefined,
      created_at: issue.createdAt ?? now,
      updated_at: issue.updatedAt ?? now,
    },
  };
}

export function chunkKnowledgeDocument(doc: KnowledgeDocument): SupportChunk[] {
  const now = new Date().toISOString();
  const blocks = doc.body
    .split(/\n(?=#{1,4}\s)|\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: SupportChunk[] = [];
  let idx = 0;
  for (const block of blocks.length ? blocks : [doc.body]) {
    const text = `${doc.title}\n\n${block}`.slice(0, 1800);
    chunks.push({
      id: `${doc.source}:${doc.id}:${idx++}`.replace(/\s+/g, "_"),
      text,
      metadata: {
        repo: doc.source,
        branch: doc.spaceKey ?? "knowledge",
        filePath: doc.id,
        language: "text",
        sourceType: doc.source === "confluence" ? "confluence" : "docs",
        title: doc.title,
        url: doc.url,
        source_name: doc.source === "confluence" ? "Confluence" : doc.source,
        source_url: doc.url,
        file_path: doc.id,
        created_at: now,
        updated_at: doc.updatedAt ?? now,
      },
    });
  }
  return chunks;
}

export function chunkCommit(commit: CommitInfo, ref: RepoRef): SupportChunk {
  const repo = repoSlug(ref);
  const branch = ref.branch ?? "main";
  return {
    id: `${repo}:${branch}:commit:${commit.sha}`,
    text: `Commit ${commit.sha}: ${commit.message}\nFiles: ${(commit.files ?? []).join(", ")}`,
    metadata: {
      repo,
      branch,
      filePath: commit.sha,
      language: "n/a",
      sourceType: "commit",
      title: commit.message,
      lastCommit: commit.sha,
    },
  };
}
