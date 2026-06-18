import { NextResponse } from "next/server";
import { getConfig, hasOpenAI, hasPinecone, hasGitHub, hasJira, maskSecret } from "@/lib/support/config";

export const runtime = "nodejs";

/** Reports which integrations are live vs. running on mocks. Secrets are masked. */
export async function GET() {
  const cfg = getConfig();
  return NextResponse.json({
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
      },
    },
    readOnly: cfg.readOnly,
    mode: {
      analysis: hasOpenAI(cfg) ? "llm" : "heuristic",
      vectorStore: hasPinecone(cfg) ? "pinecone" : "in-memory",
      repo: hasGitHub(cfg) ? "github" : "mock",
      tickets: hasJira(cfg) ? "jira+github" : hasGitHub(cfg) ? "github" : "mock",
    },
  });
}
