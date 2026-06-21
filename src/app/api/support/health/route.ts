import { NextResponse } from "next/server";
import {
  getConfig,
  hasOpenAI,
  hasPinecone,
  hasGitHub,
  hasJira,
  hasMcp,
  maskSecret,
  configuredCywareProducts,
} from "@/lib/support/config";
import type { CywareProductId } from "@/lib/support/cyware-products";
import { getJiraTickets, getGitHubTickets, MOCK_REPO } from "@/lib/support/connectors";
import { getCywareProductConnector } from "@/lib/support/connectors/cyware-product";
import { serverStatuses } from "@/lib/support/mcp/registry";

export const runtime = "nodejs";

interface ConnectorHealth {
  name: string;
  configured: boolean;
  mode: "live" | "mock" | "n/a";
  ok?: boolean;
  detail?: string;
}

/**
 * Connector + integration health checks. Live ping for Jira, GitHub, Cyware
 * products, and MCP servers. Secrets are masked — never returned in full.
 */
export async function GET() {
  const cfg = getConfig();
  const connectors: ConnectorHealth[] = [];

  connectors.push({ name: "openai", configured: hasOpenAI(cfg), mode: hasOpenAI(cfg) ? "live" : "mock" });
  connectors.push({ name: "pinecone", configured: hasPinecone(cfg), mode: hasPinecone(cfg) ? "live" : "mock" });

  try {
    const { connector, mock } = getGitHubTickets(MOCK_REPO);
    const ping = connector.testConnection ? await connector.testConnection() : { ok: !mock, detail: mock ? "mock" : "live" };
    connectors.push({ name: "github", configured: hasGitHub(cfg), mode: mock ? "mock" : "live", ok: ping.ok, detail: ping.detail });
  } catch (err) {
    connectors.push({ name: "github", configured: hasGitHub(cfg), mode: "mock", ok: false, detail: String(err) });
  }

  try {
    const { connector, mock } = getJiraTickets();
    const ping = !mock && connector.testConnection ? await connector.testConnection() : { ok: !mock, detail: mock ? "mock data (no JIRA_* env)" : "live" };
    connectors.push({ name: "jira", configured: hasJira(cfg), mode: mock ? "mock" : "live", ok: ping.ok, detail: ping.detail });
  } catch (err) {
    connectors.push({ name: "jira", configured: hasJira(cfg), mode: "mock", ok: false, detail: String(err) });
  }

  for (const productId of ["ctix", "csap", "cftr", "orchestrate"] as CywareProductId[]) {
    const conn = getCywareProductConnector(productId);
    if (conn.configured) {
      try {
        const ping = await conn.testConnection();
        connectors.push({ name: `cyware-${productId}`, configured: true, mode: "live", ok: ping.ok, detail: ping.detail });
      } catch (err) {
        connectors.push({ name: `cyware-${productId}`, configured: true, mode: "live", ok: false, detail: String(err) });
      }
    } else {
      connectors.push({ name: `cyware-${productId}`, configured: false, mode: "n/a", detail: "set env vars + import spec" });
    }
  }

  if (hasMcp(cfg)) {
    try {
      const statuses = await serverStatuses();
      const connected = statuses.filter((s) => s.connected).length;
      connectors.push({
        name: "mcp",
        configured: true,
        mode: "live",
        ok: connected > 0,
        detail: `${connected}/${statuses.length} server(s) connected`,
      });
    } catch (err) {
      connectors.push({ name: "mcp", configured: true, mode: "live", ok: false, detail: String(err) });
    }
  } else {
    connectors.push({ name: "mcp", configured: false, mode: "n/a", detail: "none" });
  }

  return NextResponse.json({
    appEnv: cfg.appEnv,
    readOnly: cfg.readOnly,
    cywareConfigured: configuredCywareProducts(),
    secrets: {
      openai: maskSecret(cfg.openaiApiKey),
      pinecone: maskSecret(cfg.pinecone.apiKey),
      github: maskSecret(cfg.github.token),
      jira: maskSecret(cfg.jira.apiToken),
      ctix: maskSecret(cfg.cywareProducts.ctix.apiKey),
      csap: maskSecret(cfg.cywareProducts.csap.apiKey),
      cftr: maskSecret(cfg.cywareProducts.cftr.apiKey),
      orchestrate: maskSecret(cfg.cywareProducts.orchestrate.apiKey),
    },
    connectors,
  });
}
