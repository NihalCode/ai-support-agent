import "server-only";

import type { CywareProductId } from "./cyware-products";
import { CYWARE_PRODUCT_PRESETS } from "./cyware-products";

/**
 * Central auth/config service. Reads all credentials from environment
 * variables — never hardcode secrets. Every integration is optional; when a
 * credential is missing the corresponding service falls back to a mock/in-memory
 * implementation so the app always runs.
 */

export interface CywareProductConfig {
  id: CywareProductId;
  name: string;
  baseUrl: string | null;
  apiKey: string | null;
  clientId: string | null;
  clientSecret: string | null;
  authType: string;
}

/** A single MCP server entry parsed from MCP_SERVER_CONFIG_JSON. */
export interface McpServerConfig {
  name: string;
  /** Remote transport URL (HTTP streamable or SSE endpoint). */
  url: string;
  transport: "http" | "sse";
  /** Optional static headers (e.g. bearer token) for the server. */
  headers?: Record<string, string>;
  /** Marks this server as allowed to perform write/destructive tool calls. */
  allowWrites?: boolean;
}

export interface SupportConfig {
  openaiApiKey: string | null;
  openaiModel: string;
  openaiEmbeddingModel: string;
  pinecone: {
    apiKey: string | null;
    indexName: string;
    cloud: string;
    region: string;
    /** Base namespace prefix applied to every source namespace. */
    namespace: string;
  };
  github: {
    token: string | null;
    defaultRepo: string;
  };
  vercel: {
    token: string | null;
    teamId: string | null;
    projectId: string | null;
  };
  jira: {
    baseUrl: string | null;
    email: string | null;
    apiToken: string | null;
    projectKey: string | null;
  };
  zendesk: {
    subdomain: string | null;
    email: string | null;
    apiToken: string | null;
  };
  confluence: {
    baseUrl: string | null;
    email: string | null;
    apiToken: string | null;
    spaceKey: string | null;
  };
  slack: {
    botToken: string | null;
    signingSecret: string | null;
  };
  /** @deprecated Use cywareProducts.ctix — kept for backward compatibility. */
  cyware: {
    baseUrl: string | null;
    apiKey: string | null;
    clientId: string | null;
    clientSecret: string | null;
    authType: string;
  };
  cywareProducts: Record<CywareProductId, CywareProductConfig>;
  mcpServers: McpServerConfig[];
  /** Optional durable backends. When unset the app uses file/in-memory. */
  databaseUrl: string | null;
  redisUrl: string | null;
  upstash: {
    restUrl: string | null;
    restToken: string | null;
  };
  encryptionKey: string | null;
  appEnv: string;
  appBaseUrl: string | null;
  readOnly: boolean;
}

function clean(v: string | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

function parseMcpServers(raw: string | null): McpServerConfig[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { servers?: unknown[] })?.servers)
        ? (parsed as { servers: unknown[] }).servers
        : [];
    return list
      .map((entry): McpServerConfig | null => {
        const e = entry as Partial<McpServerConfig>;
        if (!e || typeof e.name !== "string" || typeof e.url !== "string") {
          return null;
        }
        const transport = e.transport === "sse" ? "sse" : "http";
        return {
          name: e.name,
          url: e.url,
          transport,
          headers:
            e.headers && typeof e.headers === "object"
              ? (e.headers as Record<string, string>)
              : undefined,
          allowWrites: e.allowWrites === true,
        };
      })
      .filter((x): x is McpServerConfig => x !== null);
  } catch {
    return [];
  }
}

function readProductEnv(
  prefix: string,
  fallback?: { baseUrl?: string | null; apiKey?: string | null; clientId?: string | null; clientSecret?: string | null; authType?: string }
): Omit<CywareProductConfig, "id" | "name"> {
  return {
    baseUrl: clean(process.env[`${prefix}_BASE_URL`]) ?? fallback?.baseUrl ?? null,
    apiKey: clean(process.env[`${prefix}_API_KEY`]) ?? fallback?.apiKey ?? null,
    clientId: clean(process.env[`${prefix}_CLIENT_ID`]) ?? fallback?.clientId ?? null,
    clientSecret: clean(process.env[`${prefix}_CLIENT_SECRET`]) ?? fallback?.clientSecret ?? null,
    authType: clean(process.env[`${prefix}_AUTH_TYPE`]) ?? fallback?.authType ?? "api_key",
  };
}

export function getCywareProductConfig(id: CywareProductId): CywareProductConfig {
  const preset = CYWARE_PRODUCT_PRESETS[id];
  const cfg = getConfig();
  return cfg.cywareProducts[id] ?? {
    id,
    name: preset.name,
    baseUrl: null,
    apiKey: null,
    clientId: null,
    clientSecret: null,
    authType: "api_key",
  };
}

export function getConfig(): SupportConfig {
  const ctixLegacy = {
    baseUrl: clean(process.env.CYWARE_BASE_URL) ?? clean(process.env.CTIX_BASE_URL),
    apiKey: clean(process.env.CYWARE_API_KEY) ?? clean(process.env.CTIX_API_KEY),
    clientId: clean(process.env.CYWARE_CLIENT_ID) ?? clean(process.env.CTIX_CLIENT_ID),
    clientSecret: clean(process.env.CYWARE_CLIENT_SECRET) ?? clean(process.env.CTIX_CLIENT_SECRET),
    authType: clean(process.env.CYWARE_AUTH_TYPE) ?? clean(process.env.CTIX_AUTH_TYPE) ?? "api_key",
  };

  const cywareProducts: Record<CywareProductId, CywareProductConfig> = {
    ctix: { id: "ctix", name: CYWARE_PRODUCT_PRESETS.ctix.name, ...readProductEnv("CTIX", ctixLegacy) },
    csap: { id: "csap", name: CYWARE_PRODUCT_PRESETS.csap.name, ...readProductEnv("CSAP") },
    cftr: { id: "cftr", name: CYWARE_PRODUCT_PRESETS.cftr.name, ...readProductEnv("CFTR") },
    orchestrate: { id: "orchestrate", name: CYWARE_PRODUCT_PRESETS.orchestrate.name, ...readProductEnv("ORCHESTRATE") },
  };

  // CTIX also accepts legacy CYWARE_* without CTIX_ prefix.
  if (!cywareProducts.ctix.baseUrl) cywareProducts.ctix.baseUrl = ctixLegacy.baseUrl;
  if (!cywareProducts.ctix.apiKey) cywareProducts.ctix.apiKey = ctixLegacy.apiKey;
  if (!cywareProducts.ctix.clientId) cywareProducts.ctix.clientId = ctixLegacy.clientId;
  if (!cywareProducts.ctix.clientSecret) cywareProducts.ctix.clientSecret = ctixLegacy.clientSecret;

  return {
    openaiApiKey: clean(process.env.OPENAI_API_KEY),
    openaiModel: clean(process.env.OPENAI_MODEL) ?? "gpt-4o-mini",
    openaiEmbeddingModel:
      clean(process.env.OPENAI_EMBEDDING_MODEL) ?? "text-embedding-3-small",
    pinecone: {
      apiKey: clean(process.env.PINECONE_API_KEY),
      indexName: clean(process.env.PINECONE_INDEX_NAME) ?? "support-agent-rag",
      cloud: clean(process.env.PINECONE_CLOUD) ?? "aws",
      region: clean(process.env.PINECONE_REGION) ?? "us-east-1",
      namespace: clean(process.env.PINECONE_NAMESPACE) ?? "",
    },
    github: {
      token: clean(process.env.GITHUB_TOKEN),
      defaultRepo: clean(process.env.DEFAULT_GITHUB_REPO) ?? "vercel/next.js",
    },
    vercel: {
      token: clean(process.env.VERCEL_TOKEN),
      teamId: clean(process.env.VERCEL_TEAM_ID),
      projectId: clean(process.env.VERCEL_PROJECT_ID),
    },
    jira: {
      baseUrl: clean(process.env.JIRA_BASE_URL),
      email: clean(process.env.JIRA_EMAIL),
      apiToken: clean(process.env.JIRA_API_TOKEN),
      projectKey: clean(process.env.JIRA_PROJECT_KEY),
    },
    zendesk: {
      subdomain: clean(process.env.ZENDESK_SUBDOMAIN),
      email: clean(process.env.ZENDESK_EMAIL),
      apiToken: clean(process.env.ZENDESK_API_TOKEN),
    },
    confluence: {
      baseUrl: clean(process.env.CONFLUENCE_BASE_URL),
      email: clean(process.env.CONFLUENCE_EMAIL),
      apiToken: clean(process.env.CONFLUENCE_API_TOKEN),
      spaceKey: clean(process.env.CONFLUENCE_SPACE_KEY),
    },
    slack: {
      botToken: clean(process.env.SLACK_BOT_TOKEN),
      signingSecret: clean(process.env.SLACK_SIGNING_SECRET),
    },
    cyware: ctixLegacy,
    cywareProducts,
    mcpServers: parseMcpServers(clean(process.env.MCP_SERVER_CONFIG_JSON)),
    databaseUrl: clean(process.env.DATABASE_URL),
    redisUrl: clean(process.env.REDIS_URL),
    upstash: {
      restUrl: clean(process.env.UPSTASH_REDIS_REST_URL),
      restToken: clean(process.env.UPSTASH_REDIS_REST_TOKEN),
    },
    encryptionKey: clean(process.env.ENCRYPTION_KEY),
    appEnv: clean(process.env.APP_ENV) ?? clean(process.env.NODE_ENV) ?? "development",
    appBaseUrl: clean(process.env.APP_BASE_URL),
    readOnly:
      (clean(process.env.SUPPORT_AGENT_READ_ONLY) ?? "false").toLowerCase() ===
      "true",
  };
}

export function hasOpenAI(c = getConfig()): boolean {
  return Boolean(c.openaiApiKey);
}
export function hasPinecone(c = getConfig()): boolean {
  return Boolean(c.pinecone.apiKey);
}
export function hasGitHub(c = getConfig()): boolean {
  return Boolean(c.github.token);
}
export function hasVercel(c = getConfig()): boolean {
  return Boolean(c.vercel.token && c.vercel.projectId);
}
export function hasJira(c = getConfig()): boolean {
  return Boolean(c.jira.baseUrl && c.jira.email && c.jira.apiToken);
}
export function hasZendesk(c = getConfig()): boolean {
  return Boolean(c.zendesk.subdomain && c.zendesk.email && c.zendesk.apiToken);
}
export function hasConfluence(c = getConfig()): boolean {
  return Boolean(c.confluence.baseUrl && c.confluence.email && c.confluence.apiToken);
}
export function hasSlack(c = getConfig()): boolean {
  return Boolean(c.slack.botToken && c.slack.signingSecret);
}
export function hasCyware(c = getConfig()): boolean {
  return hasCywareProduct("ctix", c);
}

export function hasCywareProduct(id: CywareProductId, c = getConfig()): boolean {
  const p = c.cywareProducts[id];
  return Boolean(p.baseUrl && (p.apiKey || p.clientSecret || (p.clientId && p.clientSecret)));
}

export function configuredCywareProducts(c = getConfig()): CywareProductId[] {
  return (["ctix", "csap", "cftr", "orchestrate"] as CywareProductId[]).filter((id) =>
    hasCywareProduct(id, c)
  );
}
export function hasMcp(c = getConfig()): boolean {
  return c.mcpServers.length > 0;
}

/** Mask secrets before they ever appear in a response or log. */
export function maskSecret(value: string | null | undefined): string {
  if (!value) return "(unset)";
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}…${value.slice(-2)}`;
}
