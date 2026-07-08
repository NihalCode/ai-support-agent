import type { IntentEntities } from "./intent/types";

/** True when the user explicitly asked about commits, PRs, or repo history. */
export function userExplicitlyAskedForCommits(message: string): boolean {
  return /\b(commit|commits|git log|recent changes|repo history|pull request|PR)\b/i.test(message);
}

export interface DeveloperHandoffInput {
  message: string;
  entities: IntentEntities;
  evidenceSummary?: string;
  likelyCause?: string;
  confidence?: string;
  includeCommits?: boolean;
  commitsSummary?: string;
}

/** Structured developer handoff markdown — commits only when explicitly requested. */
export function formatDeveloperHandoff(input: DeveloperHandoffInput): string {
  const {
    message,
    entities,
    evidenceSummary,
    likelyCause,
    confidence,
    includeCommits = false,
    commitsSummary,
  } = input;

  const method = entities.httpMethod ?? entities.endpoint?.match(/^(GET|POST|PUT|PATCH|DELETE)/i)?.[0];
  const endpoint = entities.endpoint;
  const errorCode = entities.statusCode ?? entities.errorCode;
  const repo = entities.repo;
  const event = entities.event;

  const lines: string[] = ["# Developer Handoff", ""];

  lines.push("## Issue Summary");
  lines.push(
    entities.supportIssue?.trim() ||
      message.trim() ||
      "User reported an API or integration issue requiring engineering follow-up."
  );
  lines.push("");

  lines.push("## Error / Symptom");
  const symptomParts: string[] = [];
  if (method && endpoint) symptomParts.push(`${method.toUpperCase()} ${endpoint}`);
  else if (endpoint) symptomParts.push(endpoint);
  if (errorCode) symptomParts.push(`HTTP ${errorCode}`);
  if (event) symptomParts.push(`Context: ${event}`);
  lines.push(symptomParts.length ? symptomParts.join(" — ") : "See user message for observed behavior.");
  lines.push("");

  lines.push("## Reproduction Context");
  const repro: string[] = [];
  if (event) repro.push(event);
  if (entities.apiProduct) repro.push(`Product: ${entities.apiProduct}`);
  if (repo) repro.push(`Optional repo context: ${repo}`);
  if (entities.timestamp) repro.push(`When: ${entities.timestamp}`);
  lines.push(repro.length ? repro.map((r) => `- ${r}`).join("\n") : "- Reproduction steps not fully specified.");
  lines.push("");

  lines.push("## Evidence");
  lines.push(
    evidenceSummary?.trim() ||
      "- User-provided message and any connected investigation evidence.\n- Check API registry, gateway routes, and service logs."
  );
  lines.push("");

  lines.push("## Likely Root Cause");
  lines.push(
    likelyCause?.trim() ||
      (errorCode === "404"
        ? "Endpoint path/version may have changed after upgrade, or route is not registered in the API gateway."
        : "Insufficient evidence for a firm root cause — investigate endpoint registration, auth, and payload validation.")
  );
  if (confidence) lines.push(`\n*Confidence: ${confidence}*`);
  lines.push("");

  lines.push("## Impact");
  lines.push("- Customer or integration workflow blocked until resolved.");
  lines.push("");

  lines.push("## Recommended Fix");
  lines.push(
    errorCode === "404"
      ? [
          "1. Confirm the endpoint exists in the current API registry for the deployed version.",
          "2. Verify gateway/route registration after upgrade.",
          "3. Compare pre-upgrade vs post-upgrade path and HTTP method.",
          "4. Check logs for route-not-found vs resource-not-found.",
          repo ? `5. If applicable, inspect ${repo} for stale API client paths.` : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "1. Reproduce with the exact method, path, and payload.\n2. Trace request ID in tenant logs.\n3. Compare against current API documentation."
  );
  lines.push("");

  lines.push("## Validation Plan");
  lines.push(
    "- Repeat the failing request against the corrected endpoint/path.\n- Confirm expected HTTP status and response body.\n- Verify no regression in related endpoints."
  );
  lines.push("");

  lines.push("## Missing Information");
  const missing: string[] = [];
  if (!entities.apiProduct) missing.push("Product (CSAP, CFTR, CTIX, Orchestrate)");
  if (!entities.requestId) missing.push("Request ID or trace ID");
  if (!entities.timestamp) missing.push("Approximate time range / environment");
  lines.push(
    missing.length ? missing.map((m) => `- ${m}`).join("\n") : "- No critical gaps — proceed with investigation."
  );
  lines.push("");

  if (includeCommits && commitsSummary) {
    lines.push("## Related Commits");
    lines.push(commitsSummary);
    lines.push("");
  }

  return lines.join("\n");
}

export const DEVELOPER_HANDOFF_SYSTEM_PROMPT = `The user wants a developer/engineering handoff. Use ONLY investigation evidence and the user's message.
Structure the response exactly with these markdown sections:
# Developer Handoff
## Issue Summary
## Error / Symptom
## Reproduction Context
## Evidence
## Likely Root Cause
## Impact
## Recommended Fix
## Validation Plan
## Missing Information
## Related Commits (ONLY if the user explicitly asked about commits, git log, PRs, or repo history)

Do NOT mention latest commits, git history, or source control unless the user explicitly requested it.
Focus on the actual error, endpoint, status code, and practical engineering next steps.`;
