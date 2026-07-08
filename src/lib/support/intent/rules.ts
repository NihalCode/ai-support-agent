import type { UserIntent, IntentScore, WorkspaceIntentContext } from "./types";
import { userExplicitlyAskedForCommits } from "../developer-handoff";

export interface IntentRule {
  intent: UserIntent;
  weight: number;
  re: RegExp;
  label: string;
}

const HTTP_STATUS_RE = /\b(400|401|403|404|409|429|500|502|503|504)\b/;
const API_PATH_RE = /\b\/v\d+\/[\w/{}\-:.]+|\b\/[\w/{}\-:.]{3,}/;

/** Pattern rules — ordered groups; multiple can match; highest score wins after context boosts. */
export const INTENT_RULES: IntentRule[] = [
  // API troubleshooting — must beat build_app for error/status/endpoint prompts
  {
    intent: "api_troubleshooting",
    weight: 14,
    re: /\b(404|401|403|500|502|503)\b/i,
    label: "HTTP status code",
  },
  {
    intent: "api_troubleshooting",
    weight: 13,
    re: /\b(GET|POST|PUT|PATCH|DELETE)\s+\/[\w/{}\-:.]+/i,
    label: "HTTP method + path",
  },
  {
    intent: "api_troubleshooting",
    weight: 12,
    re: /\b(after upgrad(e|ing)|post-upgrade|since the upgrade)\b/i,
    label: "after upgrade",
  },
  {
    intent: "api_troubleshooting",
    weight: 11,
    re: /\b(returns?|returned|getting|got)\s+(a\s+)?(4\d{2}|5\d{2})\b/i,
    label: "returns status code",
  },
  {
    intent: "api_troubleshooting",
    weight: 10,
    re: /\b(endpoint|api)\b.{0,40}\b(not found|404|error|fail|timeout)\b/i,
    label: "endpoint error",
  },
  {
    intent: "api_troubleshooting",
    weight: 10,
    re: /\b\/v[123]\/[\w/{}\-:.]+/i,
    label: "versioned API path",
  },

  // Build app — only explicit app-building phrasing (never primary for API errors)
  {
    intent: "unsupported_app_build_request",
    weight: 8,
    re: /\b(build|create|scaffold|generate|make)\b.*\b(app|application|dashboard|portal|frontend|tool|ui)\b/i,
    label: "explicit build",
  },
  {
    intent: "unsupported_app_build_request",
    weight: 7,
    re: /\b(i need|we need|can you make|want)\b.{0,40}\b(internal tool|dashboard|small app|something my team|portal|page where)\b/i,
    label: "need a tool",
  },
  {
    intent: "unsupported_app_build_request",
    weight: 8,
    re: /\bcreate something\b.{0,40}\b(team|analysts?)\b/i,
    label: "create for team",
  },

  {
    intent: "unsupported_app_build_request",
    weight: 7,
    re: /\b(analysts?|team)\b.{0,50}\b(search|look up|review|check)\b.{0,40}\b(indicator|threat|ip|domain|ioc)\b/i,
    label: "analyst tool",
  },
  {
    intent: "unsupported_app_build_request",
    weight: 6,
    re: /\b(dashboard|tool)\b.{0,30}\b(checking|search|lookup|review)\b.{0,30}\b(ip|domain|indicator|threat)\b/i,
    label: "dashboard for lookup",
  },
  {
    intent: "unsupported_app_build_request",
    weight: 7,
    re: /\blook up threats\b|\bclient-facing search\b/i,
    label: "threat lookup app",
  },
  {
    intent: "unsupported_app_build_request",
    weight: 7,
    re: /\b(search tool|details panel|client-facing search|internal tool)\b/i,
    label: "app feature phrase",
  },
  {
    intent: "unsupported_app_build_request",
    weight: 7,
    re: /\b(something for the team|design a simple dashboard|search page for threat)\b/i,
    label: "team tool phrasing",
  },

  // Edit app — natural phrasing (unsupported)
  {
    intent: "edit_app",
    weight: 9,
    re: /\b(make it|make this|make the)\b.{0,30}\b(cleaner|clean|professional|client[- ]ready|presentable|polished|modern|less messy|less cluttered|easier to read|something i can show)\b/i,
    label: "polish UI",
  },
  {
    intent: "edit_app",
    weight: 8,
    re: /\b(too much like a demo|looks like a demo|rough demo|demo-like|not client[- ]ready)\b/i,
    label: "demo-like",
  },
  {
    intent: "edit_app",
    weight: 8,
    re: /\b(remove|delete|drop|hide|get rid of)\b.{0,40}\b(text|sentence|heading|prompt|that|this|top)\b/i,
    label: "remove text",
  },
  {
    intent: "edit_app",
    weight: 7,
    re: /\b(improve|fix|update|change|clean up|polish|simplify)\b.{0,30}\b(ui|layout|design|page|landing|table|dashboard|look|spacing)\b/i,
    label: "improve UI",
  },
  {
    intent: "edit_app",
    weight: 7,
    re: /\b(add|include|enable)\b.{0,20}\b(filter|sort|column|table|search box)\b/i,
    label: "add feature",
  },
  {
    intent: "edit_app",
    weight: 6,
    re: /\b(cluttered|messy|ugly|unprofessional|hard to read|confusing layout)\b/i,
    label: "negative UI feedback",
  },
  {
    intent: "edit_app",
    weight: 6,
    re: /\bshow my manager|show the customer|client[- ]facing|customer[- ]facing\b/i,
    label: "stakeholder ready",
  },

  // Deploy / preview (unsupported)
  {
    intent: "deploy_app",
    weight: 8,
    re: /\b(put (this|it) online|online for review|preview deployment|publish a preview)\b/i,
    label: "online/preview deploy",
  },
  {
    intent: "deploy_app",
    weight: 9,
    re: /\b(deploy|publish|ship|release|push to production|go live)\b/i,
    label: "deploy",
  },
  {
    intent: "preview_app",
    weight: 8,
    re: /\b(share (this|it|with)|send (a )?link|give me a link|preview link|try it|on the internet|for my team to try|url my colleagues)\b/i,
    label: "share/preview",
  },

  // Support investigation
  {
    intent: "diagnose_support_issue",
    weight: 9,
    re: /\b(stopped working|not working|broken|failing|freezing|frozen|hangs?|hanging|timeout|timed out|stuck|spinning)\b/i,
    label: "failure symptom",
  },
  {
    intent: "diagnose_support_issue",
    weight: 8,
    re: /\b(customers? say|users? say|nobody knows why|don't know why|no one knows)\b/i,
    label: "unknown cause",
  },
  {
    intent: "diagnose_support_issue",
    weight: 8,
    re: /\b(automation|workflow|playbook|integration|api)\b.{0,40}\b(fail|hang|stop|break|issue|problem)\b/i,
    label: "workflow issue",
  },
  {
    intent: "diagnose_support_issue",
    weight: 7,
    re: /\b(block(?:ing)?|malicious|bad ip|indicator|threat)\b.{0,50}\b(fail|hang|stop|freeze|issue|problem)\b/i,
    label: "blocking issue",
  },
  {
    intent: "diagnose_support_issue",
    weight: 8,
    re: /\b(customer says|used to work last week|never completes|spins forever|fails intermittently)\b/i,
    label: "customer/regression symptom",
  },
  {
    intent: "diagnose_support_issue",
    weight: 7,
    re: /\b(playbook fail|orchestration playbook|workflow never|completes and spins)\b/i,
    label: "playbook/workflow failure",
  },
  {
    intent: "diagnose_support_issue",
    weight: 8,
    re: /\b(what caused|why (did|does)|what's causing)\b.{0,40}\b(error|fail|issue|\d{3})\b/i,
    label: "what caused error",
  },
  {
    intent: "diagnose_support_issue",
    weight: 7,
    re: /\b(4\d{2}|5\d{2}) error\b|\berror\?\s*$/i,
    label: "status code error question",
  },

  // Investigation follow-ups
  {
    intent: "generate_customer_response",
    weight: 11,
    re: /\b(for the client|customer reply|tell the customer|plain english for the client|say back to them|draft a customer|simple terms for the client)\b/i,
    label: "customer response phrase",
  },
  {
    intent: "generate_customer_response",
    weight: 12,
    re: /\bwhat should support tell\b/i,
    label: "support customer guidance",
  },
  {
    intent: "generate_customer_response",
    weight: 12,
    re: /\b(explain the fix to the customer|fix to the customer|customer in plain english)\b/i,
    label: "customer fix explanation",
  },
  {
    intent: "generate_developer_handoff",
    weight: 11,
    re: /\b(developer needs|engineering team|engineering need|dev know|handoff note|investigate further)\b/i,
    label: "developer handoff phrase",
  },
  {
    intent: "generate_developer_handoff",
    weight: 10,
    re: /\b(what should (dev|engineering|the developer)|developer handoff|send to engineering|summarize for dev)\b/i,
    label: "developer handoff",
  },
  {
    intent: "continue_investigation",
    weight: 5,
    re: /\b(what did you find|any updates|status update|is this known|already fixed|duplicate)\b/i,
    label: "investigation follow-up",
  },

  // CQL / API
  {
    intent: "generate_cql",
    weight: 10,
    re: /\b(write (?:a )?cql(?: query)?|help (?:me )?write (?:a )?cql|cql query for)\b/i,
    label: "write CQL query",
  },
  {
    intent: "generate_cql",
    weight: 8,
    re: /\b(cql|cyware query|turn this into.{0,20}query|find indicators|last week|high confidence)\b/i,
    label: "CQL generation",
  },
  {
    intent: "validate_cql",
    weight: 10,
    re: /\b(validate|check|verify)\b.{0,25}\bcql\b|\bvalidate this cql\b/i,
    label: "validate CQL",
  },
  {
    intent: "generate_cql",
    weight: 9,
    re: /\b(write a query|help me write a query|query for last|turn this into.{0,20}query)\b/i,
    label: "write query",
  },
  {
    intent: "generate_api_request",
    weight: 7,
    re: /\b(api call|request body|make the api|show me the request|generate.{0,15}(request|curl|payload))\b/i,
    label: "API request",
  },
  {
    intent: "search_api_docs",
    weight: 8,
    re: /\b(api expect|indicators api|what does the .+ api|endpoint handles|payload\?\s*$)\b/i,
    label: "API docs question",
  },
  {
    intent: "generate_api_request",
    weight: 8,
    re: /\b(build the http request|http request for|make the api call|build the .+ request)\b/i,
    label: "build HTTP request",
  },

  // Fix / tests (build-app legacy — routes to unsupported when active project)
  {
    intent: "fix_error",
    weight: 10,
    re: /\b(fix (that|this|it|the error)|fix that error|why did (the )?build fail|build failed|preview (is )?not opening|it broke again|why (the|this) error|tell me why.*error|error occurred|npm run build exited|parsing ecmascript|turbopack build failed|build error occurred|command failed)\b/i,
    label: "fix error",
  },
  {
    intent: "run_tests",
    weight: 7,
    re: /\b(run tests|test (this|it|the app)|test build|verify build)\b/i,
    label: "run tests",
  },

  // Explain app
  {
    intent: "explain_app",
    weight: 8,
    re: /\b(explain (this|how|what)|how does this work|what does this do|in plain english|simple terms)\b/i,
    label: "explain",
  },

  // Jira / logs
  {
    intent: "search_jira",
    weight: 9,
    re: /\b(search jira|find tickets|look up .+ in jira|tickets about)\b/i,
    label: "search jira",
  },
  {
    intent: "search_logs",
    weight: 8,
    re: /\b(search logs|check logs|log lines|what do logs say)\b/i,
    label: "search logs",
  },
  {
    intent: "create_jira_ticket",
    weight: 7,
    re: /\b(create jira|open a ticket|file a ticket|jira draft)\b/i,
    label: "create jira",
  },
  {
    intent: "update_jira_ticket",
    weight: 7,
    re: /\b(update (the )?ticket|add (it )?to the ticket|comment on ticket)\b/i,
    label: "update jira",
  },

  // Commit — only when explicitly requested (guard applied in scoreMessageRules)
  {
    intent: "commit_changes",
    weight: 7,
    re: /\b(commit|push changes|save to git|check in changes)\b/i,
    label: "commit",
  },

  // Credentials
  {
    intent: "configure_credentials",
    weight: 6,
    re: /\b(credentials|api key|token|env var|environment variable|vercel token)\b/i,
    label: "credentials",
  },
];

export const SLASH_INTENT_MAP: Record<string, UserIntent> = {
  "/build-app": "unsupported_app_build_request",
  "/build": "unsupported_app_build_request",
  "/deploy-app": "deploy_app",
  "/deploy": "deploy_app",
  "/investigate": "diagnose_support_issue",
  "/diagnose": "diagnose_support_issue",
  "/validate-cql": "validate_cql",
  "/search-jira": "search_jira",
  "/search-logs": "search_logs",
  "/customer-response": "generate_customer_response",
  "/developer-handoff": "generate_developer_handoff",
  "/generate-api-call": "generate_api_request",
  "/suggest-patch": "suggest_patch",
  "/create-jira-draft": "create_jira_ticket",
  "/explain-code": "explain_app",
};

export function scoreMessageRules(message: string): IntentScore[] {
  const scores = new Map<UserIntent, IntentScore>();
  for (const rule of INTENT_RULES) {
    if (!rule.re.test(message)) continue;
    if (rule.intent === "commit_changes" && !userExplicitlyAskedForCommits(message)) continue;
    const existing = scores.get(rule.intent);
    if (!existing || existing.score < rule.weight) {
      scores.set(rule.intent, { intent: rule.intent, score: rule.weight, reason: rule.label });
    } else if (existing.score === rule.weight) {
      existing.reason += `; ${rule.label}`;
    }
  }

  // Short messages that are just a status code
  const trimmed = message.trim();
  if (/^\d{3}$/.test(trimmed)) {
    scores.set("api_troubleshooting", {
      intent: "api_troubleshooting",
      score: 15,
      reason: "bare status code",
    });
  }

  return [...scores.values()].sort((a, b) => b.score - a.score);
}

export function applyContextBoosts(
  scores: IntentScore[],
  message: string,
  ctx: WorkspaceIntentContext
): IntentScore[] {
  const boosted = scores.map((s) => ({ ...s }));
  const add = (intent: UserIntent, amount: number, reason: string) => {
    const row = boosted.find((s) => s.intent === intent);
    if (row) {
      row.score += amount;
      row.reason += `; ${reason}`;
    } else {
      boosted.push({ intent, score: amount, reason });
    }
  };

  const hasApiSignal =
    HTTP_STATUS_RE.test(message) ||
    API_PATH_RE.test(message) ||
    /\b(after upgrad|endpoint|returns? \d{3})\b/i.test(message);

  if (hasApiSignal) {
    add("api_troubleshooting", 8, "API error signal");
    add("unsupported_app_build_request", -10, "not app build");
    add("build_app", -10, "not app build");
  }

  if (/\b(what should support tell|tell the customer|customer reply|what should I tell)\b/i.test(message)) {
    add("generate_customer_response", 12, "explicit customer guidance");
    add("api_troubleshooting", -6, "customer guidance priority");
  }

  if (/\b(request body|curl|payload for this endpoint|show me the request)\b/i.test(message)) {
    add("generate_api_request", 6, "API request help");
    add("api_troubleshooting", -6, "not error troubleshooting");
  }

  if (ctx.buildProjectId) {
    add("edit_app", 4, "active app");
    add("preview_app", 3, "active app");
    add("deploy_app", 3, "active app");
    add("explain_app", 3, "active app");
    add("fix_error", 2, "active app");
    add("run_tests", 2, "active app");
    add("unsupported_app_build_request", -3, "active app suppresses new build");

    if (/\b(share|link|online|preview|deploy|publish|url|colleagues|team can try)\b/i.test(message)) {
      add("preview_app", 7, "share/deploy phrasing");
      add("deploy_app", 6, "share/deploy phrasing");
      add("edit_app", -4, "not UI edit");
    }
    if (/\b(preview deployment|online for review|put .+ online)\b/i.test(message)) {
      add("deploy_app", 8, "explicit deploy phrasing");
      add("edit_app", -5, "not UI edit");
    }
  }

  if (ctx.buildFailed || ctx.buildOk === false) {
    add("fix_error", 6, "build failed");
    add("run_tests", 3, "build failed");
  }

  if (/\b(npm run build|turbopack|ecmascript|parsing .+ failed|exited with \d+|command failed)\b/i.test(message)) {
    add("fix_error", 8, "build log in message");
    add("edit_app", -4, "not UI edit");
  }

  if (ctx.sessionId || ctx.investigationId) {
    if (/\b(customer|client|tell them|say back|plain english for)\b/i.test(message)) {
      add("generate_customer_response", 5, "customer phrasing + investigation");
    }
    if (/\b(engineer|developer|dev|handoff|engineering)\b/i.test(message)) {
      add("generate_developer_handoff", 5, "engineering phrasing + investigation");
    }
    add("continue_investigation", 2, "active investigation");
    add("search_jira", 2, "active investigation");
    add("search_logs", 2, "active investigation");
    add("suggest_patch", 2, "active investigation");
    add("unsupported_app_build_request", -2, "investigation active");
  }

  if (/^(fix (that|it|this)|can you fix that)\b/i.test(message.trim())) {
    if (ctx.buildFailed || ctx.buildOk === false) add("fix_error", 8, "contextual fix");
    else if (ctx.buildProjectId) add("edit_app", 5, "contextual fix → edit");
    else if (ctx.sessionId) add("continue_investigation", 5, "contextual fix → investigate");
    else if (hasApiSignal) add("api_troubleshooting", 6, "contextual fix → API");
  }

  if (ctx.buildProjectId && /\b(messy|cluttered|demo|professional|cleaner|polish)\b/i.test(message)) {
    add("edit_app", 6, "vague UI + active app");
  }

  if (ctx.buildProjectId && /\b(share|link|team|try it|online)\b/i.test(message)) {
    add("preview_app", 5, "share + active app");
    add("deploy_app", 4, "share + active app");
    add("diagnose_support_issue", -4, "not support issue");
  }

  const hasFailure = /\b(fail|error|broken|hang|timeout|stop|issue|problem|404|500|401|403)\b/i.test(message);
  if (hasFailure) {
    const diag = boosted.find((s) => s.intent === "diagnose_support_issue");
    const api = boosted.find((s) => s.intent === "api_troubleshooting");
    const cql = boosted.find((s) => s.intent === "generate_cql");
    if (api && hasApiSignal) api.score += 6;
    else if (diag && cql) diag.score += 4;
  }

  if (/\b(write (?:a )?cql|cql query for|cql grammar)\b/i.test(message)) {
    const cql = boosted.find((s) => s.intent === "generate_cql");
    const diag = boosted.find((s) => s.intent === "diagnose_support_issue");
    if (cql) cql.score += 6;
    if (diag) diag.score = Math.max(0, diag.score - 8);
  }

  return boosted.sort((a, b) => b.score - a.score);
}

export { HTTP_STATUS_RE, API_PATH_RE };
