import "server-only";

import type {
  InvestigationObject,
  InvestigationPatch,
  InvestigationEvidence,
  InvestigationHypothesis,
  InvestigationTimelineEvent,
} from "./object-types";
import { isTestMode } from "@/lib/test-mode";

const g = globalThis as unknown as {
  __investigationObjects?: Map<string, InvestigationObject>;
};

function store(): Map<string, InvestigationObject> {
  if (!g.__investigationObjects) g.__investigationObjects = new Map();
  return g.__investigationObjects;
}

export function listInvestigations(): InvestigationObject[] {
  return [...store().values()].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function getInvestigation(id: string): InvestigationObject | null {
  return store().get(id) ?? null;
}

export function createInvestigation(
  partial: Pick<InvestigationObject, "title" | "userIssue"> & Partial<InvestigationObject>
): InvestigationObject {
  const now = new Date().toISOString();
  const id = partial.id ?? crypto.randomUUID();
  const inv: InvestigationObject = {
    id,
    sessionId: partial.sessionId,
    title: partial.title,
    status: partial.status ?? "open",
    createdAt: now,
    updatedAt: now,
    userIssue: partial.userIssue,
    knownDetails: partial.knownDetails ?? [],
    missingDetails: partial.missingDetails ?? [],
    evidence: partial.evidence ?? [],
    pinnedEvidence: partial.pinnedEvidence ?? [],
    hypotheses: partial.hypotheses ?? [],
    timeline: partial.timeline ?? [
      {
        id: crypto.randomUUID(),
        type: "created",
        summary: "Investigation created",
        at: now,
      },
    ],
    relevantEndpoints: partial.relevantEndpoints ?? [],
    relevantCqlQueries: partial.relevantCqlQueries ?? [],
    relevantLogs: partial.relevantLogs ?? [],
    relevantJiraTickets: partial.relevantJiraTickets ?? [],
    relevantCodeFiles: partial.relevantCodeFiles ?? [],
    suspectedRootCause: partial.suspectedRootCause,
    confidence: partial.confidence ?? "low",
    supportCanResolve: partial.supportCanResolve ?? "unknown",
    alreadyFixed: partial.alreadyFixed ?? "unknown",
    recommendedNextStep: partial.recommendedNextStep,
    customerFacingResponse: partial.customerFacingResponse,
    developerHandoff: partial.developerHandoff,
  };
  store().set(id, inv);
  return inv;
}

function addTimeline(inv: InvestigationObject, event: Omit<InvestigationTimelineEvent, "id" | "at">) {
  inv.timeline.push({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    ...event,
  });
}

export function patchInvestigation(id: string, patch: InvestigationPatch): InvestigationObject | null {
  const inv = store().get(id);
  if (!inv) return null;
  const now = new Date().toISOString();

  if (patch.pinEvidence && !inv.pinnedEvidence.includes(patch.pinEvidence)) {
    inv.pinnedEvidence.push(patch.pinEvidence);
    addTimeline(inv, { type: "evidence_pinned", summary: `Pinned evidence ${patch.pinEvidence}` });
  }
  if (patch.unpinEvidence) {
    inv.pinnedEvidence = inv.pinnedEvidence.filter((e) => e !== patch.unpinEvidence);
    addTimeline(inv, { type: "evidence_unpinned", summary: `Unpinned evidence ${patch.unpinEvidence}` });
  }
  if (patch.addHypothesis) {
    const h: InvestigationHypothesis = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      status: patch.addHypothesis.status ?? "active",
      confidence: patch.addHypothesis.confidence ?? "medium",
      evidenceIds: patch.addHypothesis.evidenceIds ?? [],
      title: patch.addHypothesis.title,
      description: patch.addHypothesis.description,
      notes: patch.addHypothesis.notes,
    };
    inv.hypotheses.push(h);
    addTimeline(inv, { type: "hypothesis_added", summary: h.title });
  }
  if (patch.updateHypothesis) {
    const idx = inv.hypotheses.findIndex((h) => h.id === patch.updateHypothesis!.id);
    if (idx >= 0) {
      inv.hypotheses[idx] = { ...inv.hypotheses[idx], ...patch.updateHypothesis, updatedAt: now };
      if (patch.updateHypothesis.status === "accepted") {
        inv.suspectedRootCause = inv.hypotheses[idx].title;
        inv.confidence = inv.hypotheses[idx].confidence;
        addTimeline(inv, { type: "hypothesis_accepted", summary: inv.hypotheses[idx].title });
      }
    }
  }
  if (patch.addTimeline) {
    addTimeline(inv, patch.addTimeline);
  }
  if (patch.evidence) {
    for (const e of patch.evidence) {
      if (!inv.evidence.find((x) => x.id === e.id)) inv.evidence.push(e);
    }
  }

  const { pinEvidence, unpinEvidence, addHypothesis, updateHypothesis, addTimeline: _at, ...rest } = patch;
  Object.assign(inv, rest, { updatedAt: now });
  store().set(id, inv);
  return inv;
}

export function exportInvestigationMarkdown(inv: InvestigationObject): string {
  const pinned = inv.evidence.filter((e) => inv.pinnedEvidence.includes(e.id));
  return [
    `# Investigation: ${inv.title}`,
    "",
    `**Status:** ${inv.status} · **Confidence:** ${inv.confidence}`,
    "",
    "## User issue",
    inv.userIssue,
    "",
    "## Known details",
    ...inv.knownDetails.map((d) => `- **${d.label}:** ${d.value}`),
    "",
    "## Missing details",
    ...inv.missingDetails.map((q) => `- ${q.question}`),
    "",
    "## Pinned evidence",
    ...pinned.map((e) => `- [${e.sourceType}] ${e.title}: ${e.summary}`),
    "",
    "## Hypotheses",
    ...inv.hypotheses.map(
      (h) => `- **${h.title}** (${h.status}, ${h.confidence}) — ${h.description}`
    ),
    "",
    inv.suspectedRootCause ? `## Root cause\n${inv.suspectedRootCause}` : "",
    inv.customerFacingResponse ? `\n## Customer response\n${inv.customerFacingResponse}` : "",
    inv.developerHandoff ? `\n## Developer handoff\n${inv.developerHandoff}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Seed mock investigation for test mode. */
export function ensureTestInvestigation(): InvestigationObject {
  if (!isTestMode()) throw new Error("Test investigation only in test mode");
  const existing = listInvestigations()[0];
  if (existing) return existing;
  return createInvestigation({
    title: "Test investigation",
    userIssue: "Tag creation fails with 400",
    status: "in_progress",
    confidence: "medium",
  });
}
