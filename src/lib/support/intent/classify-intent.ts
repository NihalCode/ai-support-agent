import type {
  IntentClassification,
  IntentConfidence,
  IntentEntities,
  UserIntent,
  UserTechnicalLevel,
  WorkspaceIntentContext,
} from "./types";
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
  const methodMatch = message.match(/\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[\w/{}\-:.]+)/i);
  const httpMethod = methodMatch?.[1]?.toUpperCase();
  const endpoint =
    methodMatch?.[2] ??
    message.match(/\b(\/v\d+\/[\w/{}\-:.]+|\b\/[\w/{}\-:.]{3,})/)?.[1];
  const statusCode = message.match(/\b(400|401|403|404|409|429|500|502|503|504)\b/)?.[1];
  const requestId = message.match(/\b(request[_-]?id|req[_-]?id|trace[_-]?id)[:\s]+([A-Za-z0-9-]+)/i)?.[2];
  const timestamp = message.match(
    /\b(yesterday|today|last week|since \w+|about \d+ days? ago|\d{4}-\d{2}-\d{2})/i
  )?.[0];
  const event = message.match(/\b(after upgrad(?:e|ing)|post-upgrade|since the upgrade)\b/i)?.[0];
  const repo =
    message.match(/\bRepo\s+([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)/i)?.[1] ??
    message.match(/\b([a-z0-9-]+\/[a-z0-9._-]+)\b/i)?.[1];
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
    httpMethod,
    statusCode,
    errorCode: statusCode,
    event,
    repo,
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
    case "api_troubleshooting":
      return "Diagnose API endpoint, status code, and routing — check registry, gateway, and logs.";
    case "build_app":
    case "unsupported_app_build_request":
      return "App building is not available — I can help with API endpoints, CQL, and implementation guidance.";
    case "edit_app":
      return "Generated app editing is not available — I can help with API snippets and developer handoffs instead.";
    case "preview_app":
    case "deploy_app":
      return "App preview and deploy are not available — I can help with API troubleshooting and support investigations.";
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
    api_troubleshooting: "api:troubleshoot",
    build_app: "build_app:plan",
    unsupported_app_build_request: "build_app:plan",
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
        question: "I can help investigate a support issue or work with APIs/CQL. What should I focus on?",
        choices: ["Investigate a support issue", "Generate API/CQL help", "Draft a developer handoff"],
      };
    }
    return {
      needs: true,
      question: "I can help investigate a support issue, troubleshoot an API error, or work with CQL. What should I focus on?",
      choices: ["Investigate a support issue", "Troubleshoot an API error", "Generate CQL help"],
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
    const hasFailure = /\b(fail|error|broken|hang|stop|issue|problem|workflow|automation|timeout|freeze|404|500|401|403|stops?|times out)\b/i.test(
      message
    );
    const hasApiPath = /\b\/v\d+\/|\b(GET|POST|PUT|PATCH|DELETE)\s+\//i.test(message);
    if (wordCount >= 3 && hasApiPath && hasFailure) {
      scores.push({ intent: "api_troubleshooting", score: 6, reason: "API path + failure" });
    } else if (wordCount >= 8 && !ctx.buildProjectId && hasFailure) {
      scores.push({ intent: "diagnose_support_issue", score: 5, reason: "long descriptive failure message" });
    } else if (wordCount >= 6 && !ctx.buildProjectId && !hasFailure && !hasApiPath) {
      const hasAppVocab = /\b(search tool|dashboard|internal tool|portal|page where|client-facing search)\b/i.test(
        message
      );
      if (hasAppVocab) {
        scores.push({ intent: "unsupported_app_build_request", score: 5, reason: "app-like vocabulary" });
      }
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

/** Whether main chat should route to Build App workspace. @deprecated Build App removed — always false. */
export function shouldRouteToBuildAppFromIntent(
  _classification: IntentClassification,
  _ctx: WorkspaceIntentContext
): boolean {
  return false;
}

/** Whether the user is requesting app building, editing, preview, or deploy (unsupported). */
export function isAppBuildRequest(
  classification: IntentClassification,
  ctx: WorkspaceIntentContext
): boolean {
  const buildIntents: UserIntent[] = [
    "build_app",
    "edit_app",
    "explain_app",
    "preview_app",
    "deploy_app",
    "unsupported_app_build_request",
  ];
  if (buildIntents.includes(classification.primaryIntent)) return true;
  if (
    ctx.buildProjectId &&
    ["fix_error", "run_tests", "commit_changes"].includes(classification.primaryIntent)
  ) {
    return true;
  }
  if (ctx.buildProjectId && classification.secondaryIntents.some((i) => buildIntents.includes(i))) {
    return true;
  }
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
    "api_troubleshooting",
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

/** @deprecated Build App removed — delegates to standard intent classification. */
export function classifyBuildAppWorkspaceMessage(
  message: string,
  ctx: { hasProject: boolean; buildOk?: boolean | null; pendingChanges?: boolean; awaitingToken?: boolean }
): IntentClassification {
  return classifyUserIntent({
    message,
    context: {
      buildProjectId: ctx.hasProject ? "active" : null,
      buildOk: ctx.buildOk,
      buildFailed: ctx.buildOk === false,
      pendingApproval: ctx.pendingChanges,
    },
  });
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
