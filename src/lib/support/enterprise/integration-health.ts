import "server-only";

import {
  getConfig,
  hasConfluence,
  hasJira,
  hasOpenAI,
  hasPinecone,
  hasSlack,
  hasVercel,
  hasZendesk,
} from "../config";
import { isAuthConfigured } from "@/lib/auth/config";
import { pingPostgres } from "@/lib/db/postgres";
import { runIntegrationHealthCheck } from "@/integrations/core/IntegrationHealthCheck";
import type { IntegrationId } from "@/integrations/core/IntegrationTypes";
import { isTestMode } from "@/lib/test-mode";
import type { IntegrationHealthCard, IntegrationHealthStatus } from "./types";
import { getZendeskConnectorStatus } from "./zendesk-readiness";

const ENV_REQUIREMENTS: Record<string, string[]> = {
  auth0: ["AUTH0_DOMAIN", "AUTH0_CLIENT_ID", "AUTH0_CLIENT_SECRET", "AUTH0_SECRET", "APP_BASE_URL"],
  google: ["AUTH0_DOMAIN", "AUTH0_CLIENT_ID"],
  neon: ["DATABASE_URL"],
  openai: ["OPENAI_API_KEY"],
  pinecone: ["PINECONE_API_KEY", "PINECONE_INDEX"],
  jira: ["JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN"],
  zendesk: ["ZENDESK_SUBDOMAIN", "ZENDESK_EMAIL", "ZENDESK_API_TOKEN"],
  confluence: ["CONFLUENCE_BASE_URL", "CONFLUENCE_EMAIL", "CONFLUENCE_API_TOKEN"],
  slack: ["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET"],
  vercel: ["VERCEL_TOKEN"],
  mcp: ["MCP_SERVERS"],
};

function missingEnv(keys: string[]): string[] {
  return keys.filter((k) => !process.env[k]?.trim());
}

function card(
  integration: string,
  status: IntegrationHealthStatus,
  summary: string,
  extra?: Partial<IntegrationHealthCard>
): IntegrationHealthCard {
  const required = ENV_REQUIREMENTS[integration.toLowerCase()] ?? [];
  const missing = missingEnv(required);
  return {
    integration,
    status,
    lastCheckedAt: new Date().toISOString(),
    summary,
    requiredEnvVars: required.length ? required : undefined,
    missingEnvVars: missing.length ? missing : undefined,
    actions: status === "connected" ? ["test_connection", "view_logs"] : ["configure", "test_connection"],
    ...extra,
  };
}

async function registryHealth(id: IntegrationId): Promise<{ ok: boolean; detail: string } | null> {
  try {
    return await runIntegrationHealthCheck(id);
  } catch {
    return null;
  }
}

/** Build normalized integration health cards for admin/support dashboards. */
export async function buildIntegrationHealthCards(
  developerMode = false,
  organizationId?: string
): Promise<IntegrationHealthCard[]> {
  const cfg = getConfig();
  const cards: IntegrationHealthCard[] = [];

  const authConfigured = isAuthConfigured();
  cards.push(
    card(
      "Auth0",
      authConfigured ? "connected" : "not_configured",
      authConfigured
        ? "Auth0 login is configured."
        : developerMode
          ? "Set AUTH0_* env vars to enable login."
          : "Login is not configured yet."
    )
  );

  cards.push(
    card(
      "Google Login",
      authConfigured ? "connected" : "not_configured",
      authConfigured
        ? "Enable Google on the Auth0 connection for social login."
        : "Configure Auth0 first, then add Google OAuth."
    )
  );

  const postgresOk = await pingPostgres();
  cards.push(
    card(
      "Neon DB",
      cfg.databaseUrl ? (postgresOk ? "connected" : "error") : "not_configured",
      cfg.databaseUrl
        ? postgresOk
          ? "Postgres is reachable."
          : developerMode
            ? "DATABASE_URL is set but connection failed."
            : "Database connection issue — some data may not persist."
        : developerMode
          ? "Set DATABASE_URL for durable enterprise storage."
          : "Using local file storage (dev only)."
    )
  );

  cards.push(
    card(
      "OpenAI",
      hasOpenAI(cfg) ? "connected" : "not_configured",
      hasOpenAI(cfg) ? "LLM analysis enabled." : "Heuristic analysis only without OPENAI_API_KEY."
    )
  );

  cards.push(
    card(
      "Pinecone / RAG",
      hasPinecone(cfg) ? "connected" : "degraded",
      hasPinecone(cfg)
        ? `Vector index: ${cfg.pinecone.indexName}`
        : developerMode
          ? "In-memory vector store — set PINECONE_* for production RAG."
          : "Semantic search uses in-memory fallback."
    )
  );

  const jiraConfigured = hasJira(cfg);
  const jiraHealth = jiraConfigured ? await registryHealth("jira") : null;
  cards.push(
    card(
      "Jira",
      !jiraConfigured
        ? isTestMode()
          ? "mock"
          : "not_configured"
        : jiraHealth?.ok
          ? "connected"
          : "error",
      jiraHealth?.detail ??
        (jiraConfigured
          ? "Jira credentials configured."
          : isTestMode()
            ? "Mock Jira (TEST_MODE)."
            : "Jira not configured — investigations use docs/Zendesk only.")
    )
  );

  const zendeskConfigured = hasZendesk(cfg);
  const zendeskReadiness = await getZendeskConnectorStatus(organizationId);
  const zendeskHealth =
    zendeskConfigured && zendeskReadiness.ticketsStored === 0
      ? await registryHealth("zendesk")
      : null;
  const zendeskStatus: IntegrationHealthStatus =
    zendeskReadiness.syncState === "ready"
      ? "connected"
      : zendeskReadiness.syncState === "stale" ||
          zendeskReadiness.syncState === "partial"
        ? "degraded"
        : zendeskReadiness.syncState === "failed"
          ? "error"
          : zendeskConfigured && zendeskHealth?.ok
            ? "connected"
            : isTestMode()
              ? "mock"
              : "not_configured";
  cards.push(
    card(
      "Zendesk",
      zendeskStatus,
      zendeskReadiness.ticketsStored > 0
        ? `${zendeskReadiness.syncState}: ${zendeskReadiness.ticketsStored} tickets stored, ${zendeskReadiness.ticketsIndexed} searchable, ${zendeskReadiness.commentsIndexed} comments indexed.`
        : zendeskHealth?.detail ??
            (zendeskConfigured
              ? "Zendesk configured; initial synchronization has not completed."
              : isTestMode()
                ? "Mock Zendesk (TEST_MODE)."
                : "Zendesk is not connected and no imported ticket history is available.")
    )
  );

  const confluenceConfigured = hasConfluence(cfg);
  const confluenceHealth = confluenceConfigured ? await registryHealth("confluence") : null;
  cards.push(
    card(
      "Confluence",
      !confluenceConfigured
        ? isTestMode()
          ? "mock"
          : "not_configured"
        : confluenceHealth?.ok
          ? "connected"
          : "error",
      confluenceHealth?.detail ??
        (confluenceConfigured
          ? "Confluence knowledge sync available."
          : "Confluence not configured.")
    )
  );

  const slackConfigured = hasSlack(cfg);
  const slackHealth = slackConfigured ? await registryHealth("slack") : null;
  cards.push(
    card(
      "Slack",
      !slackConfigured
        ? "not_configured"
        : slackHealth?.ok
          ? "connected"
          : "error",
      slackHealth?.detail ??
        (slackConfigured ? "Slack bot configured." : "Web chat works without Slack.")
    )
  );

  const vercelConfigured = hasVercel(cfg);
  cards.push(
    card(
      "Vercel / Deployment",
      vercelConfigured ? "connected" : isTestMode() ? "mock" : "not_configured",
      vercelConfigured
        ? "Deployment integration configured."
        : isTestMode()
          ? "Mock deployment (TEST_MODE)."
          : "Deploy actions require VERCEL_TOKEN."
    )
  );

  cards.push(
    card(
      "MCP",
      process.env.MCP_SERVERS?.trim() ? "connected" : "not_configured",
      process.env.MCP_SERVERS?.trim()
        ? "MCP servers configured."
        : "No MCP servers — optional for developer workflows."
    )
  );

  return cards;
}

export function summarizeHealthForSupportMode(cards: IntegrationHealthCard[]): string {
  const problems = cards.filter((c) => c.status === "error" || c.status === "degraded");
  if (problems.length === 0) return "All core integrations look healthy.";
  return `${problems.length} integration(s) need attention: ${problems.map((p) => p.integration).join(", ")}.`;
}
