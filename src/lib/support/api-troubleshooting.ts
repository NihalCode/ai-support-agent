import type { IntentEntities } from "./intent/types";

export interface ApiTroubleshootingInput {
  message: string;
  entities: IntentEntities;
}

/** Structured API troubleshooting response for error/status-code prompts. */
export function buildApiTroubleshootingMarkdown(input: ApiTroubleshootingInput): string {
  const { message, entities } = input;
  const method = entities.httpMethod?.toUpperCase();
  const endpoint = entities.endpoint ?? "the affected endpoint";
  const errorCode = entities.statusCode ?? entities.errorCode ?? "error";
  const event = entities.event;
  const repo = entities.repo;

  const title =
    method && entities.endpoint
      ? `## API troubleshooting: ${method} ${entities.endpoint} returns ${errorCode}`
      : entities.endpoint
        ? `## API troubleshooting: ${entities.endpoint} returns ${errorCode}`
        : `## API troubleshooting: HTTP ${errorCode}`;

  const intro = event
    ? `This looks like an endpoint/routing issue ${event}.`
    : errorCode === "404"
      ? "This looks like an endpoint/routing issue — the path or version may not exist in the current deployment."
      : "This looks like an API request failure that needs endpoint and environment verification.";

  const what404Means =
    errorCode === "404"
      ? `### What 404 likely means here
- Endpoint path or API version changed
- Route not registered after upgrade
- HTTP method/path mismatch
- Resource or tenant context missing
- API gateway/proxy route missing
- Auth/permission behavior masked as not found`
      : `### What ${errorCode} likely means here
- Request validation or auth failure
- Upstream service error or timeout
- Rate limiting or permission issue
- Payload/schema mismatch`;

  const checks: string[] = [
    "1. Confirm the endpoint exists in the API Registry for the current version.",
  ];
  if (method && entities.endpoint) {
    checks.push(`2. Verify whether ${method} ${entities.endpoint} is the correct method/path.`);
  } else {
    checks.push("2. Verify the HTTP method and path against current API docs.");
  }
  checks.push("3. Check gateway route registration after any recent upgrade.");
  checks.push("4. Compare pre-upgrade and post-upgrade route configs.");
  checks.push("5. Check logs for route-not-found vs resource-not-found.");
  checks.push("6. Confirm environment and tenant/workspace context.");
  if (repo) {
    checks.push(`7. Optional: inspect \`${repo}\` for stale client paths (only if relevant).`);
  }

  const infoNeeded: string[] = [];
  if (!entities.apiProduct) infoNeeded.push("- Product/API: CSAP, CFTR, CTIX, or Orchestrate");
  infoNeeded.push("- Environment (staging/production)");
  if (!entities.timestamp) infoNeeded.push("- Time range when failures started");
  if (!entities.requestId) infoNeeded.push("- Request ID or trace ID");
  if (event?.includes("upgrade")) infoNeeded.push("- Whether this worked before the upgrade");

  return [
    title,
    "",
    intro,
    "",
    what404Means,
    "",
    "### Immediate checks",
    ...checks,
    "",
    "### Information needed",
    ...infoNeeded,
    "",
    "### Developer handoff available",
    "I can prepare a developer handoff with reproduction steps and likely root cause — say **developer handoff** when ready.",
    "",
    message.length > 120 ? `_From your message: ${message.slice(0, 200)}${message.length > 200 ? "…" : ""}_` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export const API_TROUBLESHOOTING_SYSTEM_PROMPT = `You are a Cyware API support engineer. The user reported an API error or HTTP status code.
Answer ONLY about API troubleshooting — endpoint paths, versions, gateway routing, auth, and logs.
Do NOT discuss app building, latest commits, or git history unless the user explicitly asked.
Give concrete next steps. Use plain English unless the user is clearly technical.`;
