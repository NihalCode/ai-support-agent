/**
 * Shared types for the AI Support Agent.
 *
 * The Support Agent ingests a GitHub repo (code + docs + issues + PRs) and
 * Jira tickets into a vector store, then diagnoses client-reported issues with
 * RAG, producing a structured, citable triage report.
 */

/* ----------------------------- Source / chunks ---------------------------- */

export type SourceType =
  | "code"
  | "docs"
  | "issue"
  | "pr"
  | "jira"
  | "ticket"
  | "commit";

/** Metadata stored alongside every vector chunk. */
export interface ChunkMetadata {
  repo: string; // owner/name
  branch: string;
  filePath: string; // file path, issue/PR/ticket reference, or commit sha
  language: string; // programming language or "markdown" / "text" / "n/a"
  symbol?: string; // function/class/route name if available
  lineStart?: number;
  lineEnd?: number;
  lastCommit?: string; // sha of last commit touching this file (if known)
  sourceType: SourceType;
  title?: string; // issue/PR/ticket title or doc heading
  url?: string; // canonical link (file blob, issue, PR, jira)
}

/** A chunk of repo/ticket content ready for embedding + upsert. */
export interface SupportChunk {
  id: string;
  text: string;
  metadata: ChunkMetadata;
  embedding?: number[];
}

/** A retrieved chunk with similarity score (RAG result). */
export interface RetrievedChunk {
  id: string;
  score: number;
  text: string;
  metadata: ChunkMetadata;
}

/* ------------------------------- Connectors ------------------------------- */

export interface RepoRef {
  owner: string;
  name: string;
  branch?: string;
}

export interface RepoFile {
  path: string;
  content: string;
  language: string;
  size: number;
  lastCommit?: string;
}

export interface NormalizedIssue {
  id: string; // e.g. "gh#123" or "PROJ-456"
  source: "github" | "jira" | string;
  number?: number;
  key?: string;
  title: string;
  body: string;
  state: string;
  labels: string[];
  assignee?: string;
  author?: string;
  comments: { author: string; body: string; createdAt?: string }[];
  linkedPRs?: string[];
  linkedCommits?: string[];
  attachments?: { name: string; url: string }[];
  url: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CommitInfo {
  sha: string;
  message: string;
  author?: string;
  date?: string;
  files?: string[];
}

/** Pluggable ticket source. GitHub + Jira implement this; add more later. */
export interface TicketConnector {
  readonly id: string;
  readonly isMock: boolean;
  getIssue(ref: string): Promise<NormalizedIssue | null>;
  searchIssues(query: string, limit?: number): Promise<NormalizedIssue[]>;
  /**
   * Write a comment. MUST only be called after explicit user approval; the
   * route layer enforces this. Returns the created comment URL (or a mock id).
   */
  addComment(
    ref: string,
    body: string
  ): Promise<{ ok: boolean; url?: string; mock?: boolean }>;
}

export interface RepoConnector {
  readonly id: string;
  readonly isMock: boolean;
  listFiles(ref: RepoRef): Promise<RepoFile[]>;
  getReadme(ref: RepoRef): Promise<RepoFile | null>;
  listCommits(ref: RepoRef, limit?: number): Promise<CommitInfo[]>;
}

/* ----------------------------- Analysis output ---------------------------- */

export type IssueCategory =
  | "user-error"
  | "documentation"
  | "known-bug"
  | "new-bug"
  | "feature-request"
  | "unsupported"
  | "permissions"
  | "environment"
  | "unknown";

export type Confidence = "High" | "Medium" | "Low";

export type Fixability =
  | "client-can-fix"
  | "support-can-fix"
  | "engineering-required"
  | "not-enough-info"
  | "not-doable";

export interface CodePatch {
  filePath: string;
  why: string;
  riskLevel: "low" | "medium" | "high";
  diff: string; // unified diff or before/after
  testsToRun: string[];
  rollbackPlan: string;
}

export interface AnalysisCitation {
  label: string;
  sourceType: SourceType;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  url?: string;
  ref?: string; // issue/PR/jira id
}

/** The full structured triage report (spec items A–K). */
export interface IssueAnalysis {
  summary: string; // A
  rootCause: string; // B
  confidence: Confidence; // C
  evidence: string[]; // D
  fixability: Fixability; // E
  category: IssueCategory;
  fixSteps: string[]; // F
  codeFix?: CodePatch | null; // G
  questionsForClient: string[]; // H
  suggestedTicketResponse: string; // I
  escalationNote?: string | null; // J
  citations: AnalysisCitation[]; // K
  retrievedContext: RetrievedChunk[];
  usedLlm: boolean; // false => deterministic heuristic mode (no OpenAI key)
}

/* ------------------------------- API shapes ------------------------------- */

export interface IngestRequest {
  repoUrl?: string;
  includeIssues?: boolean;
  includePRs?: boolean;
}

export interface IngestResult {
  repo: string;
  branch: string;
  namespace: string;
  chunks: number;
  upserted: number;
  bySource: Record<string, number>;
  usedMock: { repo: boolean; tickets: boolean; vectorStore: boolean };
  warnings: string[];
}

export interface AnalyzeRequest {
  repoUrl?: string;
  issueRef?: string; // optional GitHub/Jira reference to pull in
  description: string; // free-text problem description from the client
}

export interface AnalyzeResult {
  analysis: IssueAnalysis;
  issue?: NormalizedIssue | null;
  repo: string;
  usedMock: { tickets: boolean; vectorStore: boolean };
}

export interface AuditEntry {
  timestamp: string;
  action: string;
  target?: string;
  approved: boolean;
  details?: string;
}
