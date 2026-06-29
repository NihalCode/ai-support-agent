import { NextResponse } from "next/server";
import {
  getConfig,
  hasOpenAI,
  hasPinecone,
  hasGitHub,
  hasJira,
  hasZendesk,
  hasConfluence,
  hasVercel,
  hasCywareProduct,
  maskSecret,
} from "@/lib/support/config";
import { getAppSession, sessionToJson } from "@/lib/auth/session";
import { isAuthConfigured } from "@/lib/auth/config";
import { pingSessionStore } from "@/lib/support/investigation/session-store";
import { getCywareProductConnector } from "@/lib/support/connectors/cyware-product";

export const runtime = "nodejs";

/** Reports which integrations are live vs. running on mocks. Secrets are masked. */
export async function GET() {
  const cfg = getConfig();
  const session = await getAppSession();
  const ctix = getCywareProductConnector("ctix");

  const sessionBackend = await pingSessionStore();

  let ctixConnection: { ok: boolean; detail: string } | null = null;
  if (ctix.configured) {
    ctixConnection = await ctix.testConnection();
  }

  return NextResponse.json({
    auth: {
      configured: isAuthConfigured(),
      session: session ? sessionToJson(session) : null,
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
