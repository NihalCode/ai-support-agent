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
  | "zendesk"
  | "confluence"
  | "ticket"
  | "commit"
  | "openapi"
  | "postman"
  | "cyware-doc"
  | "cql-doc"
  | "resolution"
  | "error-log"
  | "runbook";

/**
 * Metadata stored alongside every vector chunk. `repo`/`branch` remain for
 * backward compatibility with code/issue sources; non-repo sources (API specs,
 * CQL docs, etc.) use the generalized `source_*`/endpoint fields below.
 */
export interface ChunkMetadata {
  repo: string; // owner/name (or source name for non-repo sources)
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

  /* --- generalized RAG metadata (Phase 7) --- */
  source_name?: string; // human label, e.g. "Cyware CTIX API" / "checkout.postman_collection"
  source_url?: string;
  file_path?: string;
  line_range?: string; // "12-48"
  endpoint_path?: string; // "/v3/indicators/"
  http_method?: string; // GET/POST/...
  jira_ticket_id?: string;
  github_issue_id?: string;
  postman_request_name?: string;
  cyware_doc_section?: string;
  cyware_doc_page?: string;
  doc_url?: string;
  created_at?: string;
  updated_at?: string;
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
  author?: string; // reporter
  priority?: string;
  comments: { author: string; body: string; createdAt?: string }[];
  linkedPRs?: string[];
  linkedCommits?: string[];
  linkedIssues?: { key: string; type: string; url?: string }[];
  attachments?: { name: string; url: string }[];
  history?: { field: string; from?: string; to?: string; author?: string; at?: string }[];
  url: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Optional capabilities a ticket connector advertises (drives UI + executor). */
export interface TicketConnectorCapabilities {
  canComment: boolean;
  canTransition: boolean;
  canLink: boolean;
  canCreate: boolean;
}

export interface JiraCreateDraft {
  projectKey: string;
  summary: string;
  description: string;
  issueType: string;
}

/** Suggestions the agent derives from an issue (read-only reasoning, never auto-applied). */
export interface TicketSuggestions {
  labels: string[];
  priority: string;
  shouldEscalate: boolean;
  escalationReason: string;
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
  listRecentIssues?(limit?: number): Promise<NormalizedIssue[]>;
  /**
   * Write a comment. MUST only be called after explicit user approval; the
   * route layer enforces this. Returns the created comment URL (or a mock id).
   */
  addComment(
    ref: string,
    body: string
  ): Promise<{ ok: boolean; url?: string; mock?: boolean }>;

  /* --- optional production capabilities (Phase 2) --- */
  readonly capabilities?: TicketConnectorCapabilities;
  /** Health check; returns ok + a human-readable detail (e.g. account name). */
  testConnection?(): Promise<{ ok: boolean; detail: string }>;
  /** Available workflow transitions for an issue. */
  listTransitions?(ref: string): Promise<{ id: string; name: string }[]>;
  /** Move an issue to a new status. Approval enforced upstream. */
  transitionIssue?(ref: string, transition: string): Promise<{ ok: boolean; url?: string }>;
  /** Link two issues. Approval enforced upstream. */
  linkIssues?(from: string, to: string, linkType: string): Promise<{ ok: boolean }>;
  /** Create an issue. Approval enforced upstream. */
  createIssue?(draft: JiraCreateDraft): Promise<{ ok: boolean; key?: string; url?: string }>;
}

export interface KnowledgeDocument {
  id: string;
  source: "confluence" | string;
  title: string;
  body: string;
  url: string;
  spaceKey?: string;
  updatedAt?: string;
}

export interface KnowledgeConnector {
  readonly id: string;
  readonly isMock: boolean;
  searchDocuments(query: string, limit?: number): Promise<KnowledgeDocument[]>;
  getDocument(id: string): Promise<KnowledgeDocument | null>;
  testConnection?(): Promise<{ ok: boolean; detail: string }>;
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
  includeEnterpriseKnowledge?: boolean;
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
  /** Safety classification of the action, when applicable. */
  safetyClass?: SafetyClass;
  /** Connector/provider/MCP server the action targeted. */
  provider?: string;
  actorId?: string;
  actorEmail?: string;
  orgId?: string;
}

/* --------------------- Normalized API schema (Phase 3) -------------------- */

export type ApiSourceKind =
  | "openapi"
  | "swagger"
  | "postman"
  | "markdown"
  | "curl"
  | "manual";

export type ParamLocation = "path" | "query" | "header" | "cookie" | "body";

export interface NormalizedParam {
  name: string;
  location: ParamLocation;
  required: boolean;
  type?: string;
  description?: string;
  example?: unknown;
  enum?: string[];
}

export interface NormalizedResponse {
  status: string; // "200", "4XX", "default"
  description?: string;
  schema?: unknown; // JSON schema or example body
  isError: boolean;
}

/**
 * Whether an endpoint mutates state. Drives the safety classifier and approval
 * gating. `read` is the only class executable in read-only mode.
 */
export type EndpointEffect =
  | "read"
  | "write"
  | "bulk"
  | "auth-changing"
  | "destructive";

export interface NormalizedEndpoint {
  operationId?: string;
  name: string; // human label / summary
  description?: string;
  method: string; // GET/POST/...
  path: string; // "/v3/indicators/{id}/"
  headersRequired: NormalizedParam[];
  headersOptional: NormalizedParam[];
  pathParams: NormalizedParam[];
  queryParams: NormalizedParam[];
  requestBodySchema?: unknown;
  requiredFields: string[];
  optionalFields: string[];
  responses: NormalizedResponse[];
  pagination?: string;
  rateLimit?: string;
  effect: EndpointEffect;
  /** Provenance (Postman folder/request name, OpenAPI tag, etc.). */
  group?: string;
  /** Deep link to the exact docs page for this endpoint (Theneo .md or browse URL). */
  docUrl?: string;
  examples?: { name: string; request?: string; response?: string }[];
}

export interface NormalizedApiSpec {
  id: string; // stable slug
  name: string;
  description?: string;
  baseUrl: string | null;
  authType: string; // "bearer" | "apiKey" | "basic" | "oauth2" | "none" | ...
  sourceKind: ApiSourceKind;
  sourceUrl?: string;
  variables?: Record<string, string>; // Postman/env variables (no secrets)
  endpoints: NormalizedEndpoint[];
  createdAt: string;
}

export interface ApiImportRequest {
  /** Raw content (OpenAPI/Swagger/Postman JSON or YAML, markdown, cURL). */
  content?: string;
  /** Or a public docs/spec URL to fetch (OpenAPI, Postman, Theneo, Postman Documenter). */
  url?: string;
  /** One-click import for a built-in Cyware product: ctix | csap | cftr | orchestrate */
  cywareProduct?: "ctix" | "csap" | "cftr" | "orchestrate";
  /** Override/hint for the parser; auto-detected when omitted. */
  kind?: ApiSourceKind;
  name?: string;
  /** Index the normalized endpoints into the RAG store. */
  index?: boolean;
}

/* ------------------------ Safety classifier (Phase 9) --------------------- */

export type SafetyClass =
  | "READ_ONLY"
  | "WRITE_LOW_RISK"
  | "WRITE_MEDIUM_RISK"
  | "WRITE_HIGH_RISK"
  | "DESTRUCTIVE"
  | "AUTH_OR_PERMISSION_CHANGE"
  | "BULK_OPERATION";

export interface SafetyVerdict {
  safetyClass: SafetyClass;
  requiresApproval: boolean;
  blocked: boolean; // true => not executable even with approval (e.g. DELETE by default)
  reason: string;
}

export interface PlannedAction {
  /** What kind of action: an HTTP API call, a connector op, or an MCP tool. */
  kind: "api" | "jira" | "github" | "cyware" | "mcp";
  method?: string; // HTTP method when kind === "api"/"cyware"
  effect?: EndpointEffect;
  provider?: string;
  toolName?: string; // MCP tool
  summary: string;
  /** Whether the user/operator allowed DELETE/destructive for this provider. */
  allowDestructive?: boolean;
}

/* ------------------------- Approval queue (Phase 1) ----------------------- */

export type ApprovalStatus = "pending" | "approved" | "rejected" | "executed" | "failed";

export interface ApprovalRequest {
  id: string;
  createdAt: string;
  status: ApprovalStatus;
  /** The concrete, fully-resolved action to run on approval. */
  action: ApprovalAction;
  safety: SafetyVerdict;
  /** Human-readable preview of exactly what will execute (redacted). */
  preview: string;
  resolvedAt?: string;
  result?: string;
}

/** Discriminated union of executable actions, all approval-gated. */
export type ApprovalAction =
  | { type: "ticket-comment"; provider: "github" | "jira" | "zendesk"; ref: string; body: string; repoUrl?: string; public?: boolean }
  | { type: "zendesk-create"; subject: string; body: string; requesterEmail?: string }
  | { type: "slack-message"; channel: string; threadTs?: string; text: string }
  | { type: "jira-transition"; ref: string; transition: string }
  | { type: "jira-link"; from: string; to: string; linkType: string }
  | { type: "jira-create"; projectKey: string; summary: string; description: string; issueType: string }
  | { type: "api-call"; provider: string; method: string; url: string; headers?: Record<string, string>; body?: string }
  | { type: "mcp-call"; server: string; tool: string; args: Record<string, unknown> }
  | { type: "build-app-scaffold"; projectId: string }
  | { type: "build-app-write"; projectId: string; paths: string[] }
  | { type: "build-app-deploy"; projectId: string; target: "preview" | "production" }
  | { type: "build-app-git-commit"; projectId: string; message: string; branch?: string };

/* ----------------------------- MCP (Phase 4) ------------------------------ */

export interface McpToolDescriptor {
  server: string;
  name: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  /** Heuristic: does invoking this tool mutate state? Drives approval. */
  isWrite: boolean;
}

export interface McpServerStatus {
  name: string;
  url: string;
  transport: "http" | "sse";
  connected: boolean;
  toolCount: number;
  error?: string;
}

export interface McpCallResult {
  ok: boolean;
  server: string;
  tool: string;
  content?: unknown;
  error?: string;
}

/* ------------------------------ CQL (Phase 5) ----------------------------- */

export interface CqlResult {
  intent: string; // user intent
  cql: string | null; // generated CQL (null if not enough info)
  explanation: string; // plain-English
  apiEndpoint?: string; // endpoint needed
  httpMethod?: string;
  queryParams?: Record<string, string>;
  payload?: unknown;
  effect: EndpointEffect;
  requiresApproval: boolean;
  expectedResult: string;
  /** When docs were insufficient, what is missing. Never hallucinate syntax. */
  missingInfo?: string[];
  citations: AnalysisCitation[];
  usedLlm: boolean;
}
