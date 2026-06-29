/**
 * Investigation IDE — structured types for multi-agent support engineering.
 */

export type InvestigationSeverity = "critical" | "high" | "medium" | "low";
export type InvestigationConfidence = "high" | "medium" | "low";

export type CurrentStatus =
  | "known-issue"
  | "duplicate"
  | "already-fixed"
  | "new-issue"
  | "regression"
  | "needs-more-information"
  | "configuration-issue"
  | "user-error";

export type EvidenceSourceType =
  | "jira"
  | "zendesk"
  | "confluence"
  | "code"
  | "logs"
  | "deployment"
  | "docs"
  | "commit"
  | "pr";

export interface SupportQuery {
  /** Free-text customer/support description */
  text: string;
  endpoint?: string;
  feature?: string;
  customerAccount?: string;
  environment?: string;
  timestamp?: string;
  version?: string;
  deploymentId?: string;
  statusCode?: number;
  errorMessage?: string;
  requestId?: string;
  traceId?: string;
  reproductionSteps?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  /** Optional linked ticket (Jira key or gh#123) */
  issueRef?: string;
  repoUrl?: string;
  /** Extracted workflow or feature name (e.g. "block malicious IP") */
  workflowName?: string;
  /** Plain-language symptom description */
  symptom?: string;
  /** When the issue started (natural language, e.g. "yesterday morning") */
  approximateStartTime?: string;
  /** Inferred product area */
  likelyCategory?: string;
  /** Whether the reporter appears non-technical */
  technicalLevel?: "non-technical" | "technical";
  urgency?: string;
  /** Endpoints inferred from docs/registry when not explicitly provided */
  inferredEndpoints?: string[];
}

export interface MissingInformationQuestion {
  id: string;
  question: string;
  whyNeeded: string;
  /** One of: endpoint | timestamp | requestId | errorMessage | version | environment */
  field?: string;
}

export interface EvidenceItem {
  id: string;
  sourceType: EvidenceSourceType;
  title: string;
  summary: string;
  url?: string;
  metadata?: Record<string, string | number | boolean | undefined>;
  redacted?: boolean;
}

export interface JiraFinding {
  tickets: EvidenceItem[];
  duplicateOf?: string;
  alreadyFixedIn?: string;
  openMatches: number;
  closedMatches: number;
  summary: string;
  mock: boolean;
}

export interface CodeFinding {
  files: EvidenceItem[];
  commits: EvidenceItem[];
  pullRequests: EvidenceItem[];
  codePathSummary?: string;
  summary: string;
  mock: boolean;
}

export interface LogFinding {
  entries: EvidenceItem[];
  patterns: string[];
  summary: string;
  mock: boolean;
}

export interface DeploymentFinding {
  deployments: EvidenceItem[];
  regressionSuspected: boolean;
  summary: string;
  mock: boolean;
}

export interface DocsFinding {
  docs: EvidenceItem[];
  usageCorrect?: boolean;
  correctedExample?: string;
  summary: string;
  mock: boolean;
}

export interface RootCauseHypothesis {
  likelyCause: string;
  confidence: InvestigationConfidence;
  severity: InvestigationSeverity;
  category:
    | "known-bug"
    | "new-bug"
    | "regression"
    | "configuration"
    | "user-error"
    | "duplicate"
    | "already-fixed"
    | "missing-info"
    | "unknown";
  affectedEndpoint?: string;
  affectedFeature?: string;
  reproducible?: boolean;
  evidenceIds: string[];
}

export interface FixProposal {
  fixable: boolean;
  suspectedRootCause: string;
  affectedFiles: string[];
  proposedChange?: string;
  testPlan: string[];
  rollbackPlan: string;
  riskLevel: "low" | "medium" | "high";
  confidence: InvestigationConfidence;
  requiresHumanReview: boolean;
  missingInfo?: string[];
}

export interface CustomerResponse {
  message: string;
  tone: "professional";
  needsMoreInfo: boolean;
}

export interface DeveloperNotes {
  markdown: string;
}

export interface JiraTicketDraft {
  title: string;
  summary: string;
  customerImpact: string;
  environment?: string;
  reproductionSteps?: string;
  suspectedRootCause: string;
  severity: InvestigationSeverity;
  priority: string;
  linkedTickets: string[];
  relatedFiles: string[];
  acceptanceCriteria: string[];
  questionsForCustomer: string[];
  /** not-created | draft | duplicate-blocked | needs-confirmation | created */
  status: "not-created" | "draft" | "duplicate-blocked" | "needs-confirmation" | "created";
  payload?: Record<string, unknown>;
  createdKey?: string;
  createdUrl?: string;
}

export interface SupportTriageReport {
  title: string;
  plainEnglishSummary: string;
  currentStatus: CurrentStatus;
  severity: InvestigationSeverity;
  confidence: InvestigationConfidence;
  whatWeFound: {
    jira: string;
    logs: string;
    code: string;
    deployments: string;
    docs: string;
    cql?: string;
    version?: string;
  };
  likelyCause: string;
  isItFixed: string;
  recommendedNextStep: string;
  customerResponse: string;
  developerNotes: string;
  jiraTicket: JiraTicketDraft;
}

export interface InvestigationContext {
  sessionId: string;
  query: SupportQuery;
  missingQuestions: MissingInformationQuestion[];
  jira: JiraFinding;
  code: CodeFinding;
  logs: LogFinding;
  deployments: DeploymentFinding;
  docs: DocsFinding;
  cql?: import("../agents/cqlAgent").CqlFinding;
  version?: import("../agents/versionAgent").VersionFinding;
  rootCause: RootCauseHypothesis;
  fixProposal: FixProposal;
  report: SupportTriageReport;
  evidence: EvidenceItem[];
  chatHistory: InvestigationChatMessage[];
  modes: {
    jira: "live" | "mock";
    github: "live" | "mock";
    vercel: "live" | "mock";
    vectors: "live" | "mock";
  };
  createdAt: string;
  updatedAt: string;
}

export interface InvestigationChatMessage {
  role: "user" | "assistant";
  content: string;
  citations?: { sourceType: EvidenceSourceType; label: string }[];
  at: string;
}

export interface AgentResult<T> {
  agent: string;
  ok: boolean;
  data: T;
  mock: boolean;
  warnings: string[];
  durationMs: number;
}

export interface InvestigateRequest {
  query: SupportQuery;
  sessionId?: string;
  /** follow-up chat message when sessionId is set */
  message?: string;
}

export interface InvestigateResponse {
  sessionId: string;
  report: SupportTriageReport;
  context: InvestigationContext;
  /** When true, investigation paused for missing info */
  needsMoreInfo: boolean;
  missingQuestions: MissingInformationQuestion[];
  chatReply?: string;
  /** Full markdown investigation report */
  markdownReport?: string;
  credentialGaps?: string[];
  supervisorReason?: string;
}
