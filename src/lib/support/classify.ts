import type {
  RetrievedChunk,
  NormalizedIssue,
  IssueCategory,
  Confidence,
  Fixability,
  IssueAnalysis,
} from "./types";
import { citationFromChunk } from "./retrieve";

/**
 * Deterministic heuristic triage engine. Used as the no-LLM fallback AND as a
 * guardrail/prior for the LLM path. It NEVER invents files or fixes — every
 * claim is grounded in the client's words or a retrieved chunk.
 */

interface Signal {
  category: IssueCategory;
  weight: number;
  patterns: RegExp[];
}

const SIGNALS: Signal[] = [
  {
    category: "environment",
    weight: 3,
    patterns: [
      /\b[Mm]issing\s+[A-Z][A-Z0-9_]{2,}\b/,
      /\benv(ironment)?\s*(var|variable)/i,
      /\b\.env\b/i,
      /\bnot set\b/i,
      /\bundefined\b.*\b(key|url|token|secret)\b/i,
    ],
  },
  {
    category: "permissions",
    weight: 3,
    patterns: [
      /\b401\b/,
      /\b403\b/,
      /\bunauthor(ized|ised)\b/i,
      /\bforbidden\b/i,
      /\bpermission(s)?\b/i,
      /\binvalid\s+(token|api key|credentials)\b/i,
    ],
  },
  {
    category: "new-bug",
    weight: 1,
    patterns: [
      /\berror\b/i,
      /\bcrash(es|ed|ing)?\b/i,
      /\bexception\b/i,
      /\bstack trace\b/i,
      /\bfails?\b/i,
      /\breject(ed|s|ing)?\b/i,
      /\bintermittent(ly)?\b/i,
      /\bnot working\b/i,
    ],
  },
  {
    category: "documentation",
    weight: 2,
    patterns: [/\bdocs?\b/i, /\breadme\b/i, /\bhow do i\b/i, /\bunclear\b/i, /\binstructions?\b/i],
  },
  {
    category: "feature-request",
    weight: 3,
    patterns: [
      /\bplease add\b/i,
      /\bfeature request\b/i,
      /\bwould love\b/i,
      /\bsupport for\b/i,
      /\bis (this|that) on the roadmap\b/i,
      /\bcan you add\b/i,
    ],
  },
  {
    category: "environment",
    weight: 2,
    patterns: [/\bnode\s*1[46]\b/i, /\bdeploy(ment)?\b/i, /\bbuild fails\b/i, /\bworks locally\b/i],
  },
];

const DEP_RE = /\b(module not found|cannot find module|can't resolve|cannot resolve|importerror|no module named)\b/i;
const API_CHANGE_RE = /\b(404|endpoint .* (not found|moved|gone)|deprecat|breaking change|migrat)/i;

function detectCategory(text: string): { category: IssueCategory; score: number } {
  const scores = new Map<IssueCategory, number>();
  for (const sig of SIGNALS) {
    for (const re of sig.patterns) {
      if (re.test(text)) scores.set(sig.category, (scores.get(sig.category) ?? 0) + sig.weight);
    }
  }
  if (DEP_RE.test(text)) scores.set("known-bug", (scores.get("known-bug") ?? 0) + 3);
  if (API_CHANGE_RE.test(text)) scores.set("known-bug", (scores.get("known-bug") ?? 0) + 2);

  let best: IssueCategory = "unknown";
  let bestScore = 0;
  for (const [cat, s] of scores) {
    if (s > bestScore) {
      best = cat;
      bestScore = s;
    }
  }
  return { category: best, score: bestScore };
}

function ticketChunks(chunks: RetrievedChunk[]): RetrievedChunk[] {
  return chunks.filter(
    (c) =>
      c.metadata.sourceType === "issue" ||
      c.metadata.sourceType === "pr" ||
      c.metadata.sourceType === "jira"
  );
}

function isLowInfo(description: string): boolean {
  const words = description.trim().split(/\s+/).filter(Boolean);
  return words.length < 5 && !/[A-Z_]{3,}|\b\d{3}\b/.test(description);
}

function fixabilityFor(category: IssueCategory, fixedAlready: boolean): Fixability {
  if (fixedAlready) return "client-can-fix";
  switch (category) {
    case "user-error":
    case "documentation":
    case "environment":
      return "client-can-fix";
    case "permissions":
      return "client-can-fix";
    case "known-bug":
      return "support-can-fix";
    case "new-bug":
      return "engineering-required";
    case "feature-request":
      return "engineering-required";
    case "unsupported":
      return "not-doable";
    default:
      return "not-enough-info";
  }
}

const CATEGORY_LABEL: Record<IssueCategory, string> = {
  "user-error": "a user/configuration error",
  documentation: "a documentation/setup gap",
  "known-bug": "a known bug with an existing fix",
  "new-bug": "a likely new bug",
  "feature-request": "a feature request",
  unsupported: "unsupported usage",
  permissions: "a permissions/authentication problem",
  environment: "an environment/configuration issue",
  unknown: "an issue that needs more detail",
};

export type HeuristicResult = Omit<IssueAnalysis, "retrievedContext" | "usedLlm">;

export function classifyHeuristic(
  description: string,
  issue: NormalizedIssue | null | undefined,
  chunks: RetrievedChunk[]
): HeuristicResult {
  const combined = `${description}\n${issue?.title ?? ""}\n${issue?.body ?? ""}`;
  const tickets = ticketChunks(chunks);

  // Detect "already fixed" / "duplicate" from retrieved tickets. Require the
  // ticket to actually be relevant (similarity gate) so an unrelated closed
  // ticket can't hijack the classification.
  const closedFix = tickets.find(
    (t) =>
      /closed|merged|done|resolved|fixed/i.test(t.text) &&
      /(fix|migrat|resolve|patch)/i.test(t.text) &&
      similarity(combined, t.text) > 0.25
  );
  const duplicate = tickets.find((t) => similarity(combined, t.text) > 0.45);

  const detected = detectCategory(combined);
  let category = detected.category;
  const score = detected.score;
  const lowInfo = isLowInfo(description) && !issue;

  if (lowInfo) {
    category = "unknown";
  } else if (
    closedFix &&
    (category === "new-bug" || category === "known-bug" || category === "unknown")
  ) {
    category = "known-bug";
  }

  const fixedAlready =
    Boolean(closedFix) && category !== "feature-request" && !lowInfo;
  const confidence: Confidence =
    lowInfo || score === 0 ? "Low" : score >= 4 || fixedAlready ? "High" : "Medium";
  const fixability = lowInfo ? "not-enough-info" : fixabilityFor(category, fixedAlready);

  const evidence: string[] = [];
  if (fixedAlready && closedFix) {
    evidence.push(
      `A previous ${closedFix.metadata.sourceType.toUpperCase()} (${closedFix.metadata.filePath}) appears to already address this: "${closedFix.metadata.title ?? ""}" — ${snippet(closedFix.text)}`
    );
  }
  if (duplicate && duplicate !== closedFix) {
    evidence.push(
      `Possible duplicate of ${duplicate.metadata.filePath}: "${duplicate.metadata.title ?? ""}" — ${snippet(duplicate.text)}`
    );
  }
  const topCode = chunks.find((c) => c.metadata.sourceType === "code");
  if (topCode) {
    evidence.push(
      `Relevant code: ${topCode.metadata.filePath}${topCode.metadata.lineStart ? `:${topCode.metadata.lineStart}-${topCode.metadata.lineEnd}` : ""}.`
    );
  }
  const topDoc = chunks.find((c) => c.metadata.sourceType === "docs");
  if (topDoc) evidence.push(`Relevant docs: ${topDoc.metadata.filePath}.`);
  if (evidence.length === 0) evidence.push("No strongly matching code or tickets were retrieved.");

  const rootCause = buildRootCause(category, combined, closedFix, duplicate);
  const fixSteps = buildFixSteps(category, combined, chunks, fixedAlready);
  const questions = buildQuestions(category, lowInfo, description);

  const summary = issue
    ? `Client reports: "${truncate(description || issue.title, 160)}". This maps to ${issue.id} ("${issue.title}").`
    : `Client reports: "${truncate(description, 160)}". This looks like ${CATEGORY_LABEL[category]}.`;

  const escalation =
    fixability === "engineering-required"
      ? buildEscalation(category, combined, chunks)
      : null;

  const suggestedTicketResponse = buildTicketResponse(category, fixSteps, fixedAlready, questions);

  return {
    summary,
    rootCause,
    confidence,
    evidence,
    fixability,
    category,
    fixSteps,
    codeFix: null,
    questionsForClient: questions,
    suggestedTicketResponse,
    escalationNote: escalation,
    citations: chunks.slice(0, 8).map(citationFromChunk),
  };
}

function buildRootCause(
  category: IssueCategory,
  text: string,
  closedFix: RetrievedChunk | undefined,
  duplicate: RetrievedChunk | undefined
): string {
  if (closedFix) {
    return `The symptoms match a previously resolved item (${closedFix.metadata.filePath}). The likely root cause was already identified and fixed there; the client is probably on an older version or hasn't applied the documented change.`;
  }
  if (duplicate) {
    return `This appears to duplicate an existing report (${duplicate.metadata.filePath}). The root cause is likely the same as that ticket.`;
  }
  switch (category) {
    case "environment":
      return "A required environment variable or runtime setting is missing or misconfigured, so the app cannot start or reach a dependency.";
    case "permissions":
      return "The request is being rejected due to missing/invalid credentials or insufficient permissions (e.g. an expired token or wrong scope).";
    case "known-bug": {
      const dep = /module not found|cannot resolve|cannot find module/i.test(text);
      if (dep) return "A required dependency is not installed or not resolvable in the build, producing a module-resolution error.";
      return "A known behavior change (e.g. an API path or version migration) is causing the failure; an existing fix or upgrade path likely applies.";
    }
    case "documentation":
      return "The behavior is expected, but the setup/usage documentation is unclear or incomplete, leading to confusion.";
    case "feature-request":
      return "This is not a defect — it requests new functionality that does not currently exist.";
    case "unsupported":
      return "The requested usage is outside what the project supports.";
    case "new-bug":
      return "The evidence does not match any known issue, so this is likely a new defect requiring engineering investigation.";
    default:
      return "There is not enough information yet to determine a confident root cause.";
  }
}

function buildFixSteps(
  category: IssueCategory,
  text: string,
  chunks: RetrievedChunk[],
  fixedAlready: boolean
): string[] {
  if (fixedAlready) {
    return [
      "Confirm the client's installed version against the version where this was fixed.",
      "Ask the client to upgrade to the latest release (or cherry-pick the referenced fix).",
      "Re-test the failing operation after upgrading.",
    ];
  }
  switch (category) {
    case "environment": {
      const m = text.match(/\b[Mm]issing\s+([A-Z][A-Z0-9_]{2,})\b/);
      const varName = m ? m[1] : "the required variable";
      return [
        `Set ${varName} in the client's environment (.env.local or deployment settings).`,
        "Cross-check all required env vars against the README env table.",
        "Restart the app/redeploy so the new value is picked up.",
      ];
    }
    case "permissions":
      return [
        "Verify the API token/key is present, valid, and not expired.",
        "Confirm the token has the required scopes/permissions.",
        "Regenerate the credential if needed and retry.",
      ];
    case "known-bug": {
      if (/module not found|cannot resolve|cannot find module/i.test(text)) {
        return [
          "Install the missing dependency (e.g. `npm install <package>`).",
          "Verify it appears in package.json dependencies, then reinstall (`npm install`).",
          "Rebuild and confirm the import resolves.",
        ];
      }
      return [
        "Apply the documented migration/upgrade referenced in the linked fix.",
        "Update any affected configuration (e.g. base URLs/paths) accordingly.",
        "Re-run the failing request to confirm.",
      ];
    }
    case "documentation":
      return [
        "Point the client to the relevant docs section.",
        "Clarify the missing step in the docs for future users.",
      ];
    case "feature-request":
      return [
        "Acknowledge the request and capture the use case.",
        "File/label it as an enhancement for roadmap triage.",
      ];
    default:
      return [
        "Gather the exact error message, logs, and reproduction steps.",
        "Confirm the version, environment, and configuration in use.",
      ];
  }
}

function buildQuestions(category: IssueCategory, lowInfo: boolean, description: string): string[] {
  if (lowInfo) {
    return [
      "What exact error message or behavior are you seeing?",
      "What were you trying to do when it happened?",
      "Which version/environment are you running?",
    ];
  }
  const qs: string[] = [];
  if (!/\bv?\d+\.\d+/.test(description)) qs.push("Which version of the product are you running?");
  if (category === "environment" || category === "permissions")
    qs.push("Can you confirm which environment variables/credentials are currently set (names only)?");
  if (category === "new-bug")
    qs.push("Can you share the full error/stack trace and minimal steps to reproduce?");
  return qs;
}

function buildEscalation(
  category: IssueCategory,
  text: string,
  chunks: RetrievedChunk[]
): string {
  const code = chunks.find((c) => c.metadata.sourceType === "code");
  const where = code ? ` Likely area: ${code.metadata.filePath}.` : "";
  if (category === "feature-request") {
    return `Engineering/product input needed: this is a new capability, not a defect. Capture the use case and prioritize on the roadmap.${where}`;
  }
  return `Escalate to engineering: no existing fix matches and the symptoms suggest a code-level defect. Provide repro steps, environment, and logs.${where}`;
}

function buildTicketResponse(
  category: IssueCategory,
  fixSteps: string[],
  fixedAlready: boolean,
  questions: string[]
): string {
  if (category === "unknown") {
    return `Thanks for reaching out! To help pinpoint this quickly, could you share a bit more detail: ${questions.join(" ")}`;
  }
  const intro = fixedAlready
    ? "Thanks for the report — good news, this looks like something we've already addressed."
    : "Thanks for the report — here's what we found and how to resolve it.";
  const steps = fixSteps.map((s, i) => `${i + 1}. ${s}`).join("\n");
  const tail = questions.length
    ? `\n\nIf that doesn't resolve it, could you share: ${questions.join(" ")}`
    : "";
  return `${intro}\n\n${steps}${tail}`;
}

/* ------------------------------ small helpers ----------------------------- */

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function snippet(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return truncate(oneLine, 320);
}

function similarity(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size);
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3);
}
