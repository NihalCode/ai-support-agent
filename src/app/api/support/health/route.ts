import { NextResponse } from "next/server";
import {
  getConfig,
  hasOpenAI,
  hasPinecone,
  hasGitHub,
  hasJira,
  hasCyware,
  hasMcp,
  maskSecret,
} from "@/lib/support/config";
import { getJiraTickets, getGitHubTickets, MOCK_REPO } from "@/lib/support/connectors";

export const runtime = "nodejs";

interface ConnectorHealth {
  name: string;
  configured: boolean;
  mode: "live" | "mock" | "n/a";
  ok?: boolean;
  detail?: string;
}

/**
 * Connector + integration health checks. Performs a live ping only for
 * configured connectors (Jira, GitHub). Secrets are never returned — only
 * masked presence + booleans.
 */
export async function GET() {
  const cfg = getConfig();
  const connectors: ConnectorHealth[] = [];

  // OpenAI / Pinecone — presence only (no spend on health checks).
  connectors.push({ name: "openai", configured: hasOpenAI(cfg), mode: hasOpenAI(cfg) ? "live" : "mock" });
  connectors.push({ name: "pinecone", configured: hasPinecone(cfg), mode: hasPinecone(cfg) ? "live" : "mock" });

  // GitHub.
  try {
    const { connector, mock } = getGitHubTickets(MOCK_REPO);
    const ping = connector.testConnection ? await connector.testConnection() : { ok: !mock, detail: mock ? "mock" : "live" };
    connectors.push({ name: "github", configured: hasGitHub(cfg), mode: mock ? "mock" : "live", ok: ping.ok, detail: ping.detail });
  } catch (err) {
    connectors.push({ name: "github", configured: hasGitHub(cfg), mode: "mock", ok: false, detail: String(err) });
  }

  // Jira.
  try {
    const { connector, mock } = getJiraTickets();
    const ping = !mock && connector.testConnection ? await connector.testConnection() : { ok: !mock, detail: mock ? "mock data (no JIRA_* env)" : "live" };
    connectors.push({ name: "jira", configured: hasJira(cfg), mode: mock ? "mock" : "live", ok: ping.ok, detail: ping.detail });
  } catch (err) {
    connectors.push({ name: "jira", configured: hasJira(cfg), mode: "mock", ok: false, detail: String(err) });
  }

  // Cyware.
  if (hasCyware(cfg)) {
    try {
      const { getCywareConnector } = await import("@/lib/support/connectors/cyware");
      const ping = await getCywareConnector().testConnection();
      connectors.push({ name: "cyware", configured: true, mode: "live", ok: ping.ok, detail: ping.detail });
    } catch (err) {
      connectors.push({ name: "cyware", configured: true, mode: "live", ok: false, detail: String(err) });
    }
  } else {
    connectors.push({ name: "cyware", configured: false, mode: "n/a" });
  }

  // MCP servers.
  connectors.push({
    name: "mcp",
    configured: hasMcp(cfg),
    mode: hasMcp(cfg) ? "live" : "n/a",
    detail: hasMcp(cfg) ? `${cfg.mcpServers.length} server(s) configured` : "none",
  });

  return NextResponse.json({
    appEnv: cfg.appEnv,
    readOnly: cfg.readOnly,
    secrets: {
      openai: maskSecret(cfg.openaiApiKey),
      pinecone: maskSecret(cfg.pinecone.apiKey),
      github: maskSecret(cfg.github.token),
      jira: maskSecret(cfg.jira.apiToken),
      cyware: maskSecret(cfg.cyware.apiKey),
    },
    connectors,
  });
}
