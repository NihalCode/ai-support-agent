import type { NormalizedIssue, TicketSuggestions } from "./types";

/**
 * Deterministic, read-only suggestions for a ticket: labels, priority, and
 * whether to escalate. These are *recommendations only* — they are never
 * auto-applied; applying them (e.g. a Jira label/priority update or transition)
 * always goes through the approval queue.
 */

const LABEL_RULES: { label: string; re: RegExp }[] = [
  { label: "bug", re: /\b(bug|error|exception|crash|broken|fails?|stack\s*trace|500|traceback)\b/i },
  { label: "auth", re: /\b(auth|login|token|401|403|permission|credential|unauthor)/i },
  { label: "performance", re: /\b(slow|timeout|latency|performance|hang|memory|leak)\b/i },
  { label: "documentation", re: /\b(docs?|documentation|readme|example|unclear|how\s+do\s+i)\b/i },
  { label: "regression", re: /\b(regression|after\s+upgrad|used\s+to\s+work|since\s+version|broke\s+after)\b/i },
  { label: "feature-request", re: /\b(feature|enhancement|would\s+be\s+nice|request|support\s+for)\b/i },
  { label: "data-loss", re: /\b(data\s*loss|deleted|corrupt|missing\s+data|lost)\b/i },
  { label: "security", re: /\b(security|vulnerab|cve|exploit|injection|xss|leak)\b/i },
];

const P1 = /\b(production\s+down|outage|data\s*loss|cannot\s+(log\s*in|access)|all\s+users|security|breach|critical)\b/i;
const P2 = /\b(blocked|broken|fails?|error|500|crash|regression|cannot)\b/i;
const P3 = /\b(slow|intermittent|sometimes|minor|workaround)\b/i;

export function suggestTicketMetadata(
  issue: NormalizedIssue | null,
  description = ""
): TicketSuggestions {
  const text = [issue?.title, issue?.body, description, ...(issue?.comments ?? []).map((c) => c.body)]
    .filter(Boolean)
    .join("\n")
    .slice(0, 8000);

  const labels = LABEL_RULES.filter((r) => r.re.test(text)).map((r) => r.label);

  let priority = "Medium";
  if (P1.test(text)) priority = "Highest";
  else if (P2.test(text)) priority = "High";
  else if (P3.test(text)) priority = "Low";

  const shouldEscalate = P1.test(text) || /\b(data\s*loss|security|breach|outage|production\s+down)\b/i.test(text);
  const escalationReason = shouldEscalate
    ? "High-impact signals (outage / data-loss / security / production-down) detected — recommend engineering escalation."
    : "No high-impact signals detected; support or client can likely handle this.";

  return { labels: labels.length ? labels : ["needs-triage"], priority, shouldEscalate, escalationReason };
}
