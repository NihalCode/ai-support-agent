import "server-only";

import {
  getConfig,
  hasCywareProduct,
  hasGitHub,
  hasJira,
  hasZendesk,
  hasConfluence,
  hasOpenAI,
  hasPinecone,
  hasVercel,
} from "@/lib/support/config";
import { getCywareProductConnector } from "@/lib/support/connectors/cyware-product";
import { getConfluenceDocs, getZendeskTickets } from "@/lib/support/connectors";
import { CredentialStore } from "./CredentialStore";
import type {
  IntegrationDefinition,
  IntegrationId,
  IntegrationStatus,
} from "./IntegrationTypes";

const DEFINITIONS: IntegrationDefinition[] = [
  {
    id: "jira",
    name: "Jira",
    category: "ticketing",
    description: "Search and update Jira issues.",
    envKeys: ["JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN"],
    supportsHealthCheck: true,
    supportsWrite: true,
  },
  {
    id: "zendesk",
    name: "Zendesk",
    category: "ticketing",
    description: "Zendesk Support tickets (Phase B).",
    envKeys: ["ZENDESK_SUBDOMAIN", "ZENDESK_EMAIL", "ZENDESK_API_TOKEN"],
    supportsHealthCheck: true,
    supportsWrite: true,
  },
  {
    id: "confluence",
    name: "Confluence",
    category: "docs",
    description: "Confluence docs for RAG (Phase B).",
    envKeys: ["CONFLUENCE_BASE_URL", "CONFLUENCE_EMAIL", "CONFLUENCE_API_TOKEN"],
    supportsHealthCheck: true,
    supportsWrite: false,
  },
  {
    id: "slack",
    name: "Slack",
    category: "chat",
    description: "Slack bot for approvals and triage (Phase C).",
    envKeys: ["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET"],
    supportsHealthCheck: false,
    supportsWrite: true,
  },
  {
    id: "github",
    name: "GitHub",
    category: "devops",
    description: "Repository and issue context.",
    envKeys: ["GITHUB_TOKEN"],
    supportsHealthCheck: false,
    supportsWrite: false,
  },
  {
    id: "vercel",
    name: "Vercel",
    category: "devops",
    description: "Deployments and runtime logs.",
    envKeys: ["VERCEL_TOKEN", "VERCEL_PROJECT_ID"],
    supportsHealthCheck: false,
    supportsWrite: false,
  },
  {
    id: "ctix",
    name: "Cyware CTIX",
    category: "cyware",
    description: "Intel Exchange Open API.",
    envKeys: ["CTIX_BASE_URL", "CTIX_CLIENT_ID", "CTIX_CLIENT_SECRET"],
    supportsHealthCheck: true,
    supportsWrite: true,
  },
  {
    id: "csap",
    name: "Cyware CSAP",
    category: "cyware",
    description: "Analyst Portal API.",
    envKeys: ["CSAP_BASE_URL", "CSAP_API_KEY"],
    supportsHealthCheck: false,
    supportsWrite: true,
  },
  {
    id: "cftr",
    name: "Cyware CFTR",
    category: "cyware",
    description: "Case management API.",
    envKeys: ["CFTR_BASE_URL", "CFTR_API_KEY"],
    supportsHealthCheck: false,
    supportsWrite: true,
  },
  {
    id: "orchestrate",
    name: "Cyware Orchestrate",
    category: "cyware",
    description: "Orchestration apps API.",
    envKeys: ["ORCHESTRATE_BASE_URL", "ORCHESTRATE_API_KEY"],
    supportsHealthCheck: false,
    supportsWrite: true,
  },
  {
    id: "openai",
    name: "OpenAI",
    category: "ai",
    description: "LLM reasoning and embeddings.",
    envKeys: ["OPENAI_API_KEY"],
    supportsHealthCheck: false,
    supportsWrite: false,
  },
  {
    id: "pinecone",
    name: "Pinecone",
    category: "ai",
    description: "Vector store for RAG.",
    envKeys: ["PINECONE_API_KEY"],
    supportsHealthCheck: false,
    supportsWrite: false,
  },
];

function envConfigured(keys: string[]): boolean {
  return keys.every((k) => Boolean(process.env[k]?.trim()));
}

function legacyConfigured(id: IntegrationId, cfg: ReturnType<typeof getConfig>): boolean {
  switch (id) {
    case "jira":
      return hasJira(cfg);
    case "github":
      return hasGitHub(cfg);
    case "vercel":
      return hasVercel(cfg);
    case "openai":
      return hasOpenAI(cfg);
    case "pinecone":
      return hasPinecone(cfg);
    case "ctix":
      return hasCywareProduct("ctix", cfg);
    case "csap":
      return hasCywareProduct("csap", cfg);
    case "cftr":
      return hasCywareProduct("cftr", cfg);
    case "orchestrate":
      return hasCywareProduct("orchestrate", cfg);
    case "zendesk":
      return hasZendesk(cfg);
    case "confluence":
      return hasConfluence(cfg);
    case "slack":
      return envConfigured(["SLACK_BOT_TOKEN"]);
    default:
      return false;
  }
}

export class IntegrationRegistry {
  static listDefinitions(): IntegrationDefinition[] {
    return DEFINITIONS;
  }

  static getDefinition(id: IntegrationId): IntegrationDefinition | null {
    return DEFINITIONS.find((d) => d.id === id) ?? null;
  }

  static async statusForOrg(orgId: string): Promise<IntegrationStatus[]> {
    const cfg = getConfig();
    const stored = await CredentialStore.listConfigured(orgId);
    const now = new Date().toISOString();

    return DEFINITIONS.map((def) => {
      const fromStore = stored.includes(def.id);
      const fromEnv = legacyConfigured(def.id, cfg);
      const configured = fromStore || fromEnv;
      return {
        id: def.id,
        name: def.name,
        category: def.category,
        configured,
        source: fromStore ? "store" : fromEnv ? "env" : "mock",
        health: configured ? "unknown" : "unknown",
        lastCheckedAt: now,
      } satisfies IntegrationStatus;
    });
  }

  static async healthCheck(id: IntegrationId): Promise<{ ok: boolean; detail: string }> {
    if (id === "jira") {
      const cfg = getConfig();
      if (!hasJira(cfg)) {
        return { ok: false, detail: "Jira not configured (using mock connector)" };
      }
      return { ok: true, detail: "Jira credentials present" };
    }
    if (id === "ctix") {
      const ctix = getCywareProductConnector("ctix");
      if (!ctix.configured) {
        return { ok: false, detail: "CTIX not configured" };
      }
      return ctix.testConnection();
    }
    if (id === "zendesk") {
      const { connector, mock } = getZendeskTickets();
      if (mock) return { ok: false, detail: "Zendesk not configured (using mock connector)" };
      return connector.testConnection?.() ?? { ok: true, detail: "Zendesk credentials present" };
    }
    if (id === "confluence") {
      const { connector, mock } = getConfluenceDocs();
      if (mock) return { ok: false, detail: "Confluence not configured (using mock connector)" };
      return connector.testConnection?.() ?? { ok: true, detail: "Confluence credentials present" };
    }
    const def = IntegrationRegistry.getDefinition(id);
    if (!def) return { ok: false, detail: "Unknown integration" };
    const cfg = getConfig();
    if (!legacyConfigured(id, cfg)) {
      return { ok: false, detail: `${def.name} not configured` };
    }
    return { ok: true, detail: `${def.name} credentials present` };
  }
}
