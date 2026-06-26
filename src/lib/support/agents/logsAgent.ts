import "server-only";

import type { AgentResult, LogFinding, SupportQuery } from "../investigation/types";
import { queryLogs, logsToEvidence, vercelMode } from "../services/vercelService";

export async function runLogsAgent(q: SupportQuery): Promise<AgentResult<LogFinding>> {
  const start = Date.now();
  const warnings: string[] = [];
  const { entries, mock, note } = await queryLogs({
    endpoint: q.endpoint,
    statusCode: q.statusCode,
    requestId: q.requestId ?? q.traceId,
    limit: 15,
  });

  const evidence = logsToEvidence(entries);
  const patterns: string[] = [];
  if (entries.some((e) => e.statusCode && e.statusCode >= 500)) patterns.push("5xx server errors");
  if (entries.some((e) => e.statusCode === 401 || e.statusCode === 403)) patterns.push("auth failures");
  if (entries.some((e) => /timeout|unavailable/i.test(e.message))) patterns.push("timeouts");
  if (entries.some((e) => e.statusCode === 404)) patterns.push("404 route not found");
  if (q.statusCode && q.statusCode >= 500) patterns.push("5xx server errors");
  if (/timeout|unavailable|503|502|504/i.test(`${q.errorMessage ?? ""} ${q.text}`)) patterns.push("timeouts");

  const hasFilters = Boolean(q.endpoint || q.requestId || q.traceId || q.statusCode);
  let summary: string;
  if (entries.length === 0) {
    summary = hasFilters
      ? `No log lines matched filters (endpoint ${q.endpoint ?? "—"}, request ${q.requestId ?? q.traceId ?? "—"}, status ${q.statusCode ?? "—"}). CTIX runtime logs are not in Vercel deploy events — check tenant log drains.`
      : "No matching log entries — add endpoint, request ID, or status code to narrow search.";
  } else {
    summary = `Found ${entries.length} log line(s). Patterns: ${patterns.join(", ") || "none"}. Mode: ${vercelMode()}.`;
  }

  if (mock) warnings.push("Vercel logs mock mode — set VERCEL_TOKEN + VERCEL_PROJECT_ID for live logs.");
  if (note) warnings.push(note);

  return {
    agent: "logs",
    ok: true,
    mock,
    warnings,
    durationMs: Date.now() - start,
    data: {
      entries: evidence,
      patterns: [...new Set(patterns)],
      summary,
      mock,
    },
  };
}
