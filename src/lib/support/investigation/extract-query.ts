import type { MissingInformationQuestion, SupportQuery } from "./types";

export interface ExtractedIssueDetails {
  workflowName?: string;
  supportTicketId?: string;
  symptom?: string;
  approximateStartTime?: string;
  technicalLevel: "non-technical" | "technical";
  likelyCategory?: string;
  customerName?: string;
  urgency?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  endpoint?: string;
  statusCode?: number;
  requestId?: string;
  errorMessage?: string;
}

const TICKET_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/;
const GH_RE = /\bgh#(\d+)\b/i;

/** Detect whether the reporter is likely non-technical from phrasing. */
export function detectTechnicalLevel(text: string): "non-technical" | "technical" {
  const t = text.toLowerCase();
  const nonTechnical =
    /\b(don't know|don't really know|not technical|plain english|in simple terms|my team is stuck|someone gave me|if that helps)\b/i.test(
      text
    ) ||
    /\b(i just know|can you tell me|what should i say|what do i tell)\b/i.test(text);
  const technical =
    /\b(endpoint|payload|trace id|request id|status code|stack trace|correlation id|http \d{3}|cql|openapi|postman)\b/i.test(
      text
    ) || /\b(GET|POST|PUT|PATCH|DELETE)\s+\//i.test(text);
  if (nonTechnical && !technical) return "non-technical";
  if (technical) return "technical";
  return "non-technical";
}

function extractWorkflowName(text: string): string | undefined {
  const patterns = [
    /\b(?:"([^"]{4,80})"|'([^']{4,80})')\s+workflow\b/i,
    /\b([\w\s-]{4,60})\s+workflow\b/i,
    /\bworkflow(?:\s+(?:that|to|for))?\s+([\w\s-]{4,60}?)(?:\s+(?:stops|fails|hangs|started|was|is)|[.,]|$)/i,
    /\b(block(?:ing)?\s+(?:malicious\s+)?(?:ip|website|domain)s?)\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    const name = (m?.[1] ?? m?.[2] ?? m?.[0])?.trim();
    if (name && name.length >= 4) return name.replace(/\s+/g, " ");
  }
  return undefined;
}

function extractSymptom(text: string): string | undefined {
  const patterns = [
    /\b(hangs?|fail(?:s|ed|ing)?|timeout|stops?|broken|errors?|spinning|loading)\b[^.?\n]{0,80}/i,
    /\b(stops after about (?:half a minute|30 seconds?|\d+ seconds?))/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[0].trim().slice(0, 120);
  }
  return undefined;
}

function extractApproximateTime(text: string): string | undefined {
  const m = text.match(
    /\b(since|started|from|until)\s+(yesterday(?:\s+(?:morning|afternoon|evening|night))?|today(?:\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?|\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:\d{2})?|last (?:week|night|month|monday|tuesday|wednesday|thursday|friday)|this morning|about \d+ (?:days?|hours?) ago)\b/i
  );
  return m?.[0]?.trim();
}

function inferLikelyCategory(text: string, workflow?: string): string | undefined {
  const blob = `${text} ${workflow ?? ""}`.toLowerCase();
  if (/\b(block|malicious|indicator|ip|threat|watchlist)\b/.test(blob)) {
    return "workflow automation / threat response";
  }
  if (/\b(cql|query|filter)\b/.test(blob)) return "CQL / search";
  if (/\b(orchestrat|playbook|automation)\b/.test(blob)) return "orchestration / automation";
  if (/\b(jira|ticket)\b/.test(blob)) return "support ticket follow-up";
  if (/\b(deploy|release|vercel)\b/.test(blob)) return "deployment / release";
  return undefined;
}

/** Extract structured issue details from free-text support messages. */
export function extractNaturalLanguageDetails(text: string): ExtractedIssueDetails {
  const technicalLevel = detectTechnicalLevel(text);
  const workflowName = extractWorkflowName(text);
  const ticket = text.match(TICKET_RE)?.[1];
  const gh = text.match(GH_RE)?.[0];
  const endpoint =
    text.match(/\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[\w/{}\-:.]+)/i)?.[2] ??
    text.match(/\b(\/[\w/{}\-:.]{3,})/)?.[1];
  const statusCode = Number(text.match(/\b(4\d{2}|5\d{2})\b/)?.[1]);
  const requestId = text.match(/\b(request[_-]?id|req[_-]?id|trace[_-]?id)[:\s]+([A-Za-z0-9-]+)/i)?.[2];
  const errorMessage = text.match(/\b(error|exception|message)[:\s]+["']?([^"'\n]{8,120})/i)?.[2]?.trim();

  return {
    workflowName,
    supportTicketId: ticket ?? gh,
    symptom: extractSymptom(text),
    approximateStartTime: extractApproximateTime(text),
    technicalLevel,
    likelyCategory: inferLikelyCategory(text, workflowName),
    endpoint,
    statusCode: Number.isFinite(statusCode) ? statusCode : undefined,
    requestId,
    errorMessage,
    urgency: /\b(urgent|asap|critical|production down|p1|sev-?1)\b/i.test(text) ? "high" : undefined,
  };
}

/** Build a SupportQuery from extracted details + raw message. */
export function buildSupportQueryFromDetails(
  details: ExtractedIssueDetails,
  rawText: string
): SupportQuery {
  return {
    text: rawText.trim(),
    issueRef: details.supportTicketId,
    endpoint: details.endpoint,
    statusCode: details.statusCode,
    requestId: details.requestId,
    errorMessage: details.errorMessage,
    timestamp: details.approximateStartTime,
    workflowName: details.workflowName,
    symptom: details.symptom,
    approximateStartTime: details.approximateStartTime,
    likelyCategory: details.likelyCategory,
    technicalLevel: details.technicalLevel,
    urgency: details.urgency,
    feature: details.workflowName,
    expectedBehavior: details.expectedBehavior,
    actualBehavior: details.actualBehavior ?? details.symptom,
  };
}

/** Extract structured fields from natural-language support text. */
export function enrichSupportQuery(raw: SupportQuery): SupportQuery {
  const text = raw.text ?? "";
  const extracted = extractNaturalLanguageDetails(text);
  const endpoint =
    raw.endpoint ??
    extracted.endpoint ??
    text.match(/\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[\w/{}\-:.]+)/i)?.[2] ??
    text.match(/\b(\/[\w/{}\-:.]{3,})/)?.[1];
  const statusCode = raw.statusCode ?? extracted.statusCode ?? Number(text.match(/\b(4\d{2}|5\d{2})\b/)?.[1]);
  const requestId =
    raw.requestId ?? extracted.requestId ?? text.match(/\b(request[_-]?id|req[_-]?id)[:\s]+([A-Za-z0-9-]+)/i)?.[2];
  const traceId = raw.traceId ?? text.match(/\b(trace[_-]?id)[:\s]+([A-Za-z0-9-]+)/i)?.[2];
  const version = raw.version ?? text.match(/\bversion\s+([\d.]+)/i)?.[1];
  const errorMessage =
    raw.errorMessage ??
    extracted.errorMessage ??
    text.match(/\b(error|exception|message)[:\s]+["']?([^"'\n]{8,120})/i)?.[2]?.trim();
  const issueRef =
    raw.issueRef ??
    extracted.supportTicketId ??
    text.match(TICKET_RE)?.[1] ??
    text.match(GH_RE)?.[0];

  return {
    ...raw,
    text,
    endpoint: endpoint || raw.endpoint,
    statusCode: Number.isFinite(statusCode) ? statusCode : raw.statusCode,
    requestId: requestId || raw.requestId,
    traceId: traceId || raw.traceId,
    version: version || raw.version,
    errorMessage: errorMessage || raw.errorMessage,
    issueRef: issueRef || raw.issueRef,
    workflowName: raw.workflowName ?? extracted.workflowName,
    symptom: raw.symptom ?? extracted.symptom,
    approximateStartTime: raw.approximateStartTime ?? extracted.approximateStartTime,
    timestamp: raw.timestamp ?? extracted.approximateStartTime,
    likelyCategory: raw.likelyCategory ?? extracted.likelyCategory,
    technicalLevel: raw.technicalLevel ?? extracted.technicalLevel,
    urgency: raw.urgency ?? extracted.urgency,
    feature: raw.feature ?? extracted.workflowName,
    actualBehavior: raw.actualBehavior ?? extracted.symptom,
  };
}

function plainEnglishFollowUps(q: SupportQuery): MissingInformationQuestion[] {
  const out: MissingInformationQuestion[] = [];
  if (!q.approximateStartTime && !q.timestamp) {
    out.push({
      id: "time-plain",
      question: "Roughly what time did the latest failure happen?",
      whyNeeded: "Timing helps match logs and recent changes.",
      field: "timestamp",
    });
  }
  if (!q.symptom && !q.errorMessage && !q.statusCode) {
    out.push({
      id: "symptom-plain",
      question: "Do users see an error message, or does it just keep loading?",
      whyNeeded: "This tells us whether it is a timeout, silent failure, or visible error.",
      field: "errorMessage",
    });
  }
  if (q.workflowName && !q.endpoint) {
    out.push({
      id: "scope-plain",
      question: "Does this happen every time, or only for some items?",
      whyNeeded: "Scope helps narrow whether this is data-specific or a general outage.",
    });
  }
  return out.slice(0, 3);
}

function technicalFollowUps(q: SupportQuery): MissingInformationQuestion[] {
  const out: MissingInformationQuestion[] = [];
  if (!q.endpoint && !q.feature && !q.workflowName) {
    out.push({
      id: "endpoint",
      question: "Which API endpoint or feature is failing?",
      whyNeeded: "We need a route or feature name to search code, logs, and Jira.",
      field: "endpoint",
    });
  }
  if (!q.timestamp && !q.approximateStartTime) {
    out.push({
      id: "time",
      question: "When did this start (approximate time or deployment)?",
      whyNeeded: "Timestamps help correlate logs and recent deployments.",
      field: "timestamp",
    });
  }
  if (!q.requestId && !q.traceId && !q.errorMessage) {
    out.push({
      id: "request-id",
      question: "Do you have a request ID, trace ID, or error message?",
      whyNeeded: "These pinpoint exact log lines without guessing.",
      field: "requestId",
    });
  }
  return out;
}

/** Return follow-up questions — plain English for non-technical reporters. Never blocks investigation. */
export function missingInfoQuestions(q: SupportQuery): MissingInformationQuestion[] {
  const words = q.text.trim().split(/\s+/).filter(Boolean).length;
  const veryVague =
    words < 5 && !q.endpoint && !q.issueRef && !q.errorMessage && !q.statusCode && !q.workflowName;

  if (veryVague) {
    return q.technicalLevel === "technical"
      ? technicalFollowUps(q)
      : [
          {
            id: "describe",
            question: "Can you describe what you were trying to do and what went wrong?",
            whyNeeded: "A short description lets us start checking docs, tickets, and logs.",
          },
        ];
  }

  return q.technicalLevel === "technical" ? technicalFollowUps(q) : plainEnglishFollowUps(q);
}

export function buildSearchTerms(q: SupportQuery): string {
  return [
    q.text,
    q.endpoint,
    q.feature,
    q.workflowName,
    q.symptom,
    q.likelyCategory,
    q.errorMessage,
    q.statusCode ? String(q.statusCode) : "",
    q.customerAccount,
    q.version,
    q.issueRef,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Whether a chat message looks like a support issue worth auto-investigating. */
export function isSupportLikeMessage(text: string): boolean {
  const t = text.trim();
  if (!t || t.startsWith("/")) return false;
  if (/^(hi|hello|hey|thanks|thank you|ok|okay)[!.?\s]*$/i.test(t)) return false;
  if (t.length >= 15) return true;
  if (TICKET_RE.test(t)) return true;
  if (/\b(workflow|ticket|fail|error|broken|hang|timeout|block|ip|api|issue|problem|stuck)\b/i.test(t)) {
    return true;
  }
  return false;
}

/** Plain-English intro shown when auto-starting an investigation from chat. */
export function formatPlainEnglishIntro(
  details: ExtractedIssueDetails,
  query: SupportQuery,
  missing: MissingInformationQuestion[]
): string {
  const understood: string[] = [];
  if (details.workflowName) understood.push(`- Workflow: ${details.workflowName}`);
  if (details.symptom || query.symptom) {
    understood.push(`- Problem: ${details.symptom ?? query.symptom}`);
  }
  if (details.approximateStartTime) understood.push(`- Started: ${details.approximateStartTime}`);
  if (details.supportTicketId) understood.push(`- Ticket mentioned: ${details.supportTicketId}`);
  if (details.likelyCategory) understood.push(`- Likely area: ${details.likelyCategory}`);
  understood.push(`- User technical level: ${details.technicalLevel}`);

  const checking = [
    "- Whether this matches a known Jira/support issue",
    "- Which Cyware API/workflow is likely involved",
    "- Whether logs show a timeout or failed action",
    "- Whether this was fixed in a newer version",
    "- What the customer should be told",
    "- What engineering needs if escalation is required",
  ];
  if (!query.endpoint && (query.workflowName || query.likelyCategory)) {
    checking.unshift(
      "- Imported API docs for workflows related to IP blocking, indicator actions, and orchestration runs"
    );
  }

  const need =
    missing.length > 0
      ? missing.map((m, i) => `${i + 1}. ${m.question}`).join("\n")
      : "- Nothing critical right now — I'll update you as evidence comes in.";

  return [
    "I'll investigate this from the details you gave me.",
    "",
    "## What I understood",
    ...(understood.length ? understood : ["- " + query.text.slice(0, 200)]),
    "",
    "## What I'm checking",
    ...checking,
    "",
    "## What I still need, if you have it",
    need,
    "",
  ].join("\n");
}
