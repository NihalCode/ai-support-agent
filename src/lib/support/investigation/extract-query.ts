import type { MissingInformationQuestion, SupportQuery } from "./types";

/** Extract structured fields from natural-language support text. */
export function enrichSupportQuery(raw: SupportQuery): SupportQuery {
  const text = raw.text ?? "";
  const endpoint =
    raw.endpoint ??
    text.match(/\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[\w/{}\-:.]+)/i)?.[2] ??
    text.match(/\b(\/[\w/{}\-:.]{3,})/)?.[1];
  const statusCode = raw.statusCode ?? Number(text.match(/\b(4\d{2}|5\d{2})\b/)?.[1]);
  const requestId = raw.requestId ?? text.match(/\b(request[_-]?id|req[_-]?id)[:\s]+([A-Za-z0-9-]+)/i)?.[2];
  const traceId = raw.traceId ?? text.match(/\b(trace[_-]?id)[:\s]+([A-Za-z0-9-]+)/i)?.[2];
  const version = raw.version ?? text.match(/\bversion\s+([\d.]+)/i)?.[1];
  const errorMessage =
    raw.errorMessage ??
    text.match(/\b(error|exception|message)[:\s]+["']?([^"'\n]{8,120})/i)?.[2]?.trim();
  const issueRef =
    raw.issueRef ??
    text.match(/\b([A-Z][A-Z0-9]+-\d+)\b/)?.[1] ??
    text.match(/\bgh#(\d+)\b/i)?.[0];

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
  };
}

/** Return focused questions when investigation cannot proceed safely. */
export function missingInfoQuestions(q: SupportQuery): MissingInformationQuestion[] {
  const vague =
    q.text.trim().split(/\s+/).length < 8 &&
    !q.endpoint &&
    !q.issueRef &&
    !q.errorMessage &&
    !q.statusCode;

  if (!vague) return [];

  return [
    {
      id: "endpoint",
      question: "Which API endpoint or feature is failing?",
      whyNeeded: "We need a route or feature name to search code, logs, and Jira.",
      field: "endpoint",
    },
    {
      id: "time",
      question: "When did this start (approximate time or deployment)?",
      whyNeeded: "Timestamps help correlate Vercel logs and recent deployments.",
      field: "timestamp",
    },
    {
      id: "request-id",
      question: "Do you have a request ID, trace ID, or error message?",
      whyNeeded: "These pinpoint exact log lines without guessing.",
      field: "requestId",
    },
  ];
}

export function buildSearchTerms(q: SupportQuery): string {
  return [
    q.text,
    q.endpoint,
    q.feature,
    q.errorMessage,
    q.statusCode ? String(q.statusCode) : "",
    q.customerAccount,
    q.version,
  ]
    .filter(Boolean)
    .join(" ");
}
