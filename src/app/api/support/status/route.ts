import { NextResponse } from "next/server";
import { requireSupportApi, SupportApiPermission } from "@/lib/auth/support-api-auth";
import {
  getConfig,
  hasOpenAI,
  hasPinecone,
  hasGitHub,
  hasJira,
  hasZendesk,
  hasConfluence,
  hasSlack,
  hasVercel,
  hasCywareProduct,
  maskSecret,
} from "@/lib/support/config";
import { sessionToJson } from "@/lib/auth/session";
import { isAuthConfigured } from "@/lib/auth/config";
import { userStoreBackend } from "@/lib/auth/user-store";
import { pingPostgres } from "@/lib/db/postgres";
import { credentialStoreBackend } from "@/integrations/core/CredentialStore";
import { pingSessionStore } from "@/lib/support/investigation/session-store";
import { getCywareProductConnector } from "@/lib/support/connectors/cyware-product";

export const runtime = "nodejs";

/** Reports which integrations are live vs. running on mocks. Secrets are masked. */
export async function GET(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.read, req);
  if (auth instanceof NextResponse) return auth;

  const cfg = getConfig();
  const session = auth;
  const ctix = getCywareProductConnector("ctix");

  const sessionBackend = await pingSessionStore();
  const postgresOk = await pingPostgres();

  let ctixConnection: { ok: boolean; detail: string } | null = null;
  if (ctix.configured) {
    ctixConnection = await ctix.testConnection();
  }

  return NextResponse.json({
    auth: {
      configured: isAuthConfigured(),
      session: session ? sessionToJson(session) : null,
      userStore: userStoreBackend(),
    },
    persistence: {
      databaseUrl: cfg.databaseUrl ? "(set)" : "(unset)",
      postgres: {
        configured: Boolean(cfg.databaseUrl),
        reachable: postgresOk,
        userStore: userStoreBackend(),
        credentialStore: credentialStoreBackend(),
        auditLog: userStoreBackend(),
      },
    },
    integrations: {
      openai: { configured: hasOpenAI(cfg), key: maskSecret(cfg.openaiApiKey) },
      pinecone: {
        configured: hasPinecone(cfg),
        index: cfg.pinecone.indexName,
        key: maskSecret(cfg.pinecone.apiKey),
      },
      github: {
        configured: hasGitHub(cfg),
        defaultRepo: cfg.github.defaultRepo,
        token: maskSecret(cfg.github.token),
      },
      jira: {
        configured: hasJira(cfg),
        baseUrl: cfg.jira.baseUrl ?? "(unset)",
        projectKey: cfg.jira.projectKey ?? "(unset)",
      },
      zendesk: {
        configured: hasZendesk(cfg),
        subdomain: cfg.zendesk.subdomain ?? "(unset)",
      },
      confluence: {
        configured: hasConfluence(cfg),
        baseUrl: cfg.confluence.baseUrl ?? "(unset)",
        spaceKey: cfg.confluence.spaceKey ?? "(unset)",
      },
      slack: {
        configured: hasSlack(cfg),
        botToken: maskSecret(cfg.slack.botToken),
      },
      vercel: {
        configured: hasVercel(cfg),
        projectId: cfg.vercel.projectId ?? "(unset)",
        teamId: cfg.vercel.teamId ?? "(unset)",
        token: maskSecret(cfg.vercel.token),
      },
      redis: {
        configured: Boolean(cfg.redisUrl || (cfg.upstash.restUrl && cfg.upstash.restToken)),
        url: cfg.redisUrl ? maskSecret(cfg.redisUrl) : "(unset)",
        upstash: Boolean(cfg.upstash.restUrl && cfg.upstash.restToken),
        sessionBackend,
      },
      ctix: {
        configured: hasCywareProduct("ctix", cfg),
        baseUrl: cfg.cywareProducts.ctix.baseUrl ?? "(unset)",
        connection: ctixConnection,
      },
    },
    readOnly: cfg.readOnly,
    mode: {
      analysis: hasOpenAI(cfg) ? "llm" : "heuristic",
      vectorStore: hasPinecone(cfg) ? "pinecone" : "in-memory",
      repo: hasGitHub(cfg) ? "github" : "mock",
      tickets: hasJira(cfg) ? "jira+github" : hasGitHub(cfg) ? "github" : "mock",
      vercel: hasVercel(cfg) ? "live" : "mock",
      sessions:
        sessionBackend === "upstash-rest" || sessionBackend === "redis"
          ? sessionBackend
          : cfg.upstash.restUrl || cfg.redisUrl
            ? "configured"
            : "in-memory",
    },
  });
}
