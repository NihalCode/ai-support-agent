import type {
  IntentClassification,
  IntentConfidence,
  IntentEntities,
  UserIntent,
  UserTechnicalLevel,
  WorkspaceIntentContext,
} from "./types";
import { isScaffoldApprovalMessage } from "../build-app/approval-phrases";
import { SLASH_INTENT_MAP, applyContextBoosts, scoreMessageRules } from "./rules";

const TICKET_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/g;

function detectTechnicalLevel(message: string): UserTechnicalLevel {
  const nonTechnical =
    /\b(don't know|not technical|plain english|simple terms|my manager|customer says|someone gave me)\b/i.test(
      message
    );
  const technical =
    /\b(endpoint|payload|stack trace|status code|cql|openapi|trace id|request id|http \d{3})\b/i.test(message) ||
    /\b(GET|POST|PUT|PATCH|DELETE)\s+\//i.test(message);
  if (nonTechnical && !technical) return "non_technical";
  if (technical) return "technical";
  return "semi_technical";
}

function extractEntities(message: string): IntentEntities {
  const tickets = [...message.matchAll(TICKET_RE)].map((m) => m[1]);
  const endpoint =
    message.match(/\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[\w/{}\-:.]+)/i)?.[2] ??
    message.match(/\b(\/[\w/{}\-:.]{3,})/)?.[1];
  const statusCode = message.match(/\b(4\d{2}|5\d{2})\b/)?.[1];
  const requestId = message.match(/\b(request[_-]?id|req[_-]?id|trace[_-]?id)[:\s]+([A-Za-z0-9-]+)/i)?.[2];
  const timestamp = message.match(
    /\b(yesterday|today|last week|since \w+|about \d+ days? ago|\d{4}-\d{2}-\d{2})/i
  )?.[0];
  const cqlQuery = message.match(/`([^`]+)`/)?.[1] ?? (/\bcql\b/i.test(message) ? message : undefined);
  const deployTarget = /\bprod(uction)?\b/i.test(message) ? "production" : "preview";

  let requestedOutput: IntentEntities["requestedOutput"];
  if (/\b(customer|tell them|say back)\b/i.test(message)) requestedOutput = "customer_response";
  else if (/\b(developer|engineering|dev handoff)\b/i.test(message)) requestedOutput = "developer_handoff";
  else if (/\b(plain english|simple terms)\b/i.test(message)) requestedOutput = "plain_english";
  else if (/\b(technical|detailed)\b/i.test(message)) requestedOutput = "technical";

  let apiProduct: string | undefined;
  const productMatch = message.match(/\b(CTIX|CSAP|Orchestrate|CFTR|Cyware)\b/i);
  if (productMatch) apiProduct = productMatch[1].toUpperCase();

  return {
    appDescription: message,
    editRequest: message,
    supportIssue: message,
    ticketIds: tickets.length ? tickets : undefined,
    endpoint,
    statusCode,
    requestId,
    timestamp,
    apiProduct,
    cqlQuery,
    deployTarget,
    requestedOutput,
  };
}

function confidenceFromScore(top: number, second: number): IntentConfidence {
  if (top >= 8 && top - second >= 3) return "high";
  if (top >= 5 && top - second >= 2) return "medium";
  if (top >= 4) return "medium";
  return "low";
}

function planSummaryFor(intent: UserIntent, _ctx: WorkspaceIntentContext): string {
  switch (intent) {
    case "build_app":
      return "Pick a template, connect APIs, generate files, and prepare for test/preview.";
    case "edit_app":
      return "Clean up UI, remove demo copy, improve layout, show diff, and run build.";
    case "preview_app":
      return "Check build readiness, then prepare a shareable preview link.";
    case "deploy_app":
      return "Verify build passed, check env vars, then request approval before deploying.";
    case "explain_app":
      return "Explain how the generated app works in plain language.";
    case "fix_error":
      return "Identify the failed command, propose a fix, rerun build, and report result.";
    case "diagnose_support_issue":
      return "Start investigation, infer likely workflow/API, check docs/tickets/logs.";
    case "generate_customer_response":
      return "Draft a plain-English customer reply from investigation evidence.";
    case "generate_developer_handoff":
      return "Summarize root cause and fix steps for engineering.";
    case "generate_cql":
      return "Generate a CQL query from your description and validate it.";
    case "validate_cql":
      return "Validate CQL syntax against CTIX rules.";
    case "generate_api_request":
      return "Build the API request from docs/registry.";
    case "run_tests":
      return "Run test build in the generated app directory.";
    case "commit_changes":
      return "Prepare a commit for generated changes (approval required).";
    default:
      return "Route to the best matching workspace capability.";
  }
}

function recommendedRouteFor(intent: UserIntent): string {
  const routes: Partial<Record<UserIntent, string>> = {
    build_app: "build_app:plan",
    edit_app: "build_app:edit",
    explain_app: "build_app:explain",
    preview_app: "build_app:preview",
    deploy_app: "build_app:deploy",
    commit_changes: "build_app:commit",
    fix_error: "build_app:fix",
    run_tests: "build_app:build",
    diagnose_support_issue: "investigation:create",
    continue_investigation: "investigation:chat",
    generate_customer_response: "investigation:customer_response",
    generate_developer_handoff: "investigation:developer_handoff",
    generate_cql: "cql:generate",
    validate_cql: "cql:validate",
    generate_api_request: "api:generate",
    search_api_docs: "docs:search",
    search_jira: "jira:search",
    search_logs: "logs:search",
    create_jira_ticket: "jira:create",
    update_jira_ticket: "jira:update",
    suggest_patch: "investigation:patch",
    configure_credentials: "settings:credentials",
  };
  return routes[intent] ?? "general:clarify";
}

function clarificationFor(
  scores: { intent: UserIntent; score: number }[],
  ctx: WorkspaceIntentContext
): { needs: boolean; question?: string; choices?: string[] } {
  const top = scores[0];
  const second = scores[1];
  if (!top || top.score < 3) {
    if (ctx.buildProjectId) {
      return {
        needs: true,
        question: "I can do one of these with your current app:",
        choices: ["Polish the UI", "Prepare a preview link", "Explain how it works"],
      };
    }
    return {
      needs: true,
      question: "I can help you build an app, investigate a support issue, or work with APIs/CQL. What should I focus on?",
      choices: ["Build an app", "Investigate a support issue", "Generate API/CQL help"],
    };
  }
  if (top.score - (second?.score ?? 0) < 2 && second && top.score < 7) {
    const choices: string[] = [];
    if (top.intent === "edit_app" || second.intent === "edit_app") choices.push("Edit current app");
    if (top.intent === "preview_app" || top.intent === "deploy_app" || second.intent === "preview_app")
      choices.push("Prepare a preview link");
    if (top.intent === "diagnose_support_issue" || second.intent === "diagnose_support_issue")
      choices.push("Investigate support issue");
    if (choices.length >= 2) {
      return {
        needs: true,
        question: "I'm not fully sure what you want. Did you mean:",
        choices,
      };
    }
  }
  return { needs: false };
}

export interface ClassifyIntentInput {
  message: string;
  context?: WorkspaceIntentContext;
  forcedIntent?: UserIntent;
  forcedBySlash?: string;
}

/** Classify natural-language chat into a primary intent with context awareness. */
export function classifyUserIntent(input: ClassifyIntentInput): IntentClassification {
  const ctx: WorkspaceIntentContext = input.context ?? {};
  let message = input.message.trim();
  let forcedBySlash = input.forcedBySlash;
  let forcedIntent = input.forcedIntent;

  // Parse slash command prefix
  const slashMatch = message.match(/^(\/\S+)(?:\s+(.*))?$/);
  if (slashMatch) {
    const cmd = slashMatch[1].toLowerCase();
    const mapped = SLASH_INTENT_MAP[cmd];
    if (mapped) {
      forcedIntent = mapped;
      forcedBySlash = cmd;
      message = (slashMatch[2] ?? "").trim() || message;
    }
  }

  const entities = extractEntities(message);
  const userTechnicalLevel = detectTechnicalLevel(message);

  if (forcedIntent) {
    return {
      primaryIntent: forcedIntent,
      secondaryIntents: [],
      confidence: "high",
      userTechnicalLevel,
      extractedEntities: entities,
      needsClarification: false,
      recommendedRoute: recommendedRouteFor(forcedIntent),
      planSummary: planSummaryFor(forcedIntent, ctx),
      forcedBySlash,
    };
  }

  let scores = scoreMessageRules(message);
  scores = applyContextBoosts(scores, message, ctx);

  // Long descriptive messages — infer only with supporting vocabulary
  if (scores.length === 0 || scores[0].score < 4) {
    const wordCount = message.split(/\s+/).filter(Boolean).length;
    const hasFailure = /\b(fail|error|broken|hang|stop|issue|problem|workflow|automation|timeout|freeze)\b/i.test(
      message
    );
    const hasAppVocab = /\b(search|table|dashboard|indicator|analyst|team|tool|app|portal|page where)\b/i.test(
      message
    );
    if (wordCount >= 8 && !ctx.buildProjectId && hasFailure) {
      scores.push({ intent: "diagnose_support_issue", score: 5, reason: "long descriptive failure message" });
    } else if (wordCount >= 6 && hasAppVocab && !hasFailure && !ctx.buildProjectId) {
      scores.push({ intent: "build_app", score: 5, reason: "app-like vocabulary" });
    } else if (wordCount >= 8 && ctx.buildProjectId) {
      scores.push({ intent: "edit_app", score: 5, reason: "long message with active app" });
    }
    scores.sort((a, b) => b.score - a.score);
  }

  // Active investigation session: short follow-ups
  if ((ctx.sessionId || ctx.investigationId) && message.split(/\s+/).length <= 12) {
    if (/\b(what|why|how|is it|tell me|update)\b/i.test(message) && scores[0]?.intent !== "generate_customer_response") {
      const existing = scores.find((s) => s.intent === "continue_investigation");
      if (existing) existing.score += 3;
      else scores.push({ intent: "continue_investigation", score: 5, reason: "short follow-up" });
      scores.sort((a, b) => b.score - a.score);
    }
  }

  const top = scores[0];
  const second = scores[1];

  if (!top || top.score < 3) {
    const clar = clarificationFor(scores, ctx);
    return {
      primaryIntent: "unknown",
      secondaryIntents: scores.slice(0, 3).map((s) => s.intent),
      confidence: "low",
      userTechnicalLevel,
      extractedEntities: entities,
      needsClarification: clar.needs,
      clarificationQuestion: clar.question,
      clarificationChoices: clar.choices,
      recommendedRoute: "general:clarify",
    };
  }

  const clar = clarificationFor(scores, ctx);
  const confidence = confidenceFromScore(top.score, second?.score ?? 0);

  return {
    primaryIntent: top.intent,
    secondaryIntents: scores.slice(1, 4).map((s) => s.intent),
    confidence,
    userTechnicalLevel,
    extractedEntities: entities,
    needsClarification: clar.needs && confidence === "low",
    clarificationQuestion: clar.needs && confidence === "low" ? clar.question : undefined,
    clarificationChoices: clar.needs && confidence === "low" ? clar.choices : undefined,
    recommendedRoute: recommendedRouteFor(top.intent),
    planSummary: planSummaryFor(top.intent, ctx),
  };
}

/** Whether main chat should route to Build App workspace. */
export function shouldRouteToBuildAppFromIntent(
  classification: IntentClassification,
  ctx: WorkspaceIntentContext
): boolean {
  const buildIntents: UserIntent[] = [
    "build_app",
    "edit_app",
    "explain_app",
    "preview_app",
    "deploy_app",
    "commit_changes",
    "fix_error",
    "run_tests",
  ];
  if (buildIntents.includes(classification.primaryIntent)) return true;
  if (ctx.buildProjectId && classification.secondaryIntents.some((i) => buildIntents.includes(i))) return true;
  return false;
}

/** Whether message should auto-start investigation. */
export function shouldAutoInvestigateFromIntent(
  classification: IntentClassification,
  ctx: WorkspaceIntentContext
): boolean {
  if (ctx.sessionId) return false;
  const invIntents: UserIntent[] = [
    "diagnose_support_issue",
    "search_jira",
    "search_logs",
    "suggest_patch",
  ];
  return invIntents.includes(classification.primaryIntent);
}

/** Map intent to Build App handoff mode. */
export function buildAppModeFromIntent(
  classification: IntentClassification,
  hasProject: boolean
): "plan" | "edit" | "deploy" {
  if (!hasProject) return "plan";
  if (classification.primaryIntent === "deploy_app") return "deploy";
  if (classification.primaryIntent === "preview_app") return "deploy";
  if (
    ["edit_app", "fix_error", "explain_app", "run_tests"].includes(classification.primaryIntent)
  ) {
    return "edit";
  }
  if (hasProject) return "edit";
  return "plan";
}

/** Classify Build App workspace chat (deploy, approve, edit, etc.). */
export function classifyBuildAppWorkspaceMessage(
  message: string,
  ctx: { hasProject: boolean; buildOk?: boolean | null; pendingChanges?: boolean; awaitingToken?: boolean }
): IntentClassification {
  const classification = classifyUserIntent({
    message,
    context: {
      buildProjectId: ctx.hasProject ? "active" : null,
      buildOk: ctx.buildOk,
      buildFailed: ctx.buildOk === false,
      pendingApproval: ctx.pendingChanges,
    },
  });

  // Approve patterns — must not match edit requests like "apply a filter"
  if (ctx.pendingChanges && isScaffoldApprovalMessage(message)) {
      return {
        ...classification,
        primaryIntent: "edit_app",
        confidence: "high",
        recommendedRoute: "build_app:apply",
        planSummary: "Apply pending file changes.",
        needsClarification: false,
      };
  }

  if (ctx.awaitingToken && /\b(skip|no token|demo|without|mock)\b/i.test(message)) {
    return {
      ...classification,
      primaryIntent: "preview_app",
      confidence: "high",
      recommendedRoute: "build_app:deploy_demo",
      needsClarification: false,
    };
  }

  return classification;
}

export function formatIntentSummary(classification: IntentClassification): string {
  const label = classification.primaryIntent.replace(/_/g, " ");
  const conf = classification.confidence.charAt(0).toUpperCase() + classification.confidence.slice(1);
  const lines = [
    `Understood as: ${label}`,
    `Confidence: ${conf}`,
  ];
  if (classification.planSummary) lines.push(`Plan: ${classification.planSummary}`);
  if (classification.needsClarification && classification.clarificationQuestion) {
    lines.push(classification.clarificationQuestion);
    if (classification.clarificationChoices?.length) {
      classification.clarificationChoices.forEach((c, i) => lines.push(`${i + 1}. ${c}`));
    }
  }
  return lines.join("\n");
}
