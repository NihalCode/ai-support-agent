/** First-class investigation object for IDE workspace. */

export type InvestigationStatus = "open" | "in_progress" | "blocked" | "resolved" | "escalated";
export type InvestigationConfidence = "low" | "medium" | "high";
export type SupportCanResolve = "yes" | "no" | "needs_engineering" | "unknown";
export type AlreadyFixed = "yes" | "no" | "unknown";
export type HypothesisStatus = "active" | "accepted" | "rejected";

export interface InvestigationDetail {
  id: string;
  label: string;
  value: string;
  at: string;
}

export interface InvestigationQuestion {
  id: string;
  question: string;
  whyNeeded?: string;
}

export interface InvestigationEvidence {
  id: string;
  sourceType: string;
  sourceName: string;
  title: string;
  summary: string;
  timestamp: string;
  relevance?: number;
  openTarget?: {
    kind: string;
    tabId: string;
    title: string;
    payload?: Record<string, unknown>;
  };
}

export interface InvestigationHypothesis {
  id: string;
  title: string;
  description: string;
  status: HypothesisStatus;
  confidence: InvestigationConfidence;
  evidenceIds: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvestigationTimelineEvent {
  id: string;
  type: string;
  summary: string;
  at: string;
  metadata?: Record<string, unknown>;
}

export interface InvestigationObject {
  id: string;
  sessionId?: string;
  title: string;
  status: InvestigationStatus;
  createdAt: string;
  updatedAt: string;

  userIssue: string;
  knownDetails: InvestigationDetail[];
  missingDetails: InvestigationQuestion[];
  evidence: InvestigationEvidence[];
  pinnedEvidence: string[];
  hypotheses: InvestigationHypothesis[];
  timeline: InvestigationTimelineEvent[];

  relevantEndpoints: string[];
  relevantCqlQueries: string[];
  relevantLogs: string[];
  relevantJiraTickets: string[];
  relevantCodeFiles: string[];

  suspectedRootCause?: string;
  confidence: InvestigationConfidence;
  supportCanResolve: SupportCanResolve;
  alreadyFixed: AlreadyFixed;

  recommendedNextStep?: string;
  customerFacingResponse?: string;
  developerHandoff?: string;
}

export type InvestigationPatch = Partial<
  Omit<InvestigationObject, "id" | "createdAt">
> & {
  pinEvidence?: string;
  unpinEvidence?: string;
  addHypothesis?: Omit<InvestigationHypothesis, "id" | "createdAt" | "updatedAt">;
  updateHypothesis?: Partial<InvestigationHypothesis> & { id: string };
  addTimeline?: Omit<InvestigationTimelineEvent, "id" | "at">;
};
