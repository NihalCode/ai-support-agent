import "server-only";

/**
 * Central auth/config service. Reads all credentials from environment
 * variables — never hardcode secrets. Every integration is optional; when a
 * credential is missing the corresponding service falls back to a mock/in-memory
 * implementation so the app always runs.
 */

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
  jira: {
    baseUrl: string | null;
    email: string | null;
    apiToken: string | null;
    projectKey: string | null;
  };
  cyware: {
    baseUrl: string | null;
    apiKey: string | null;
    clientId: string | null;
    clientSecret: string | null;
    authType: string;
  };
  mcpServers: McpServerConfig[];
  /** Optional durable backends. When unset the app uses file/in-memory. */
  databaseUrl: string | null;
  redisUrl: string | null;
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

export function getConfig(): SupportConfig {
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
    jira: {
      baseUrl: clean(process.env.JIRA_BASE_URL),
      email: clean(process.env.JIRA_EMAIL),
      apiToken: clean(process.env.JIRA_API_TOKEN),
      projectKey: clean(process.env.JIRA_PROJECT_KEY),
    },
    cyware: {
      baseUrl: clean(process.env.CYWARE_BASE_URL),
      apiKey: clean(process.env.CYWARE_API_KEY),
      clientId: clean(process.env.CYWARE_CLIENT_ID),
      clientSecret: clean(process.env.CYWARE_CLIENT_SECRET),
      authType: clean(process.env.CYWARE_AUTH_TYPE) ?? "api_key",
    },
    mcpServers: parseMcpServers(clean(process.env.MCP_SERVER_CONFIG_JSON)),
    databaseUrl: clean(process.env.DATABASE_URL),
    redisUrl: clean(process.env.REDIS_URL),
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
export function hasJira(c = getConfig()): boolean {
  return Boolean(c.jira.baseUrl && c.jira.email && c.jira.apiToken);
}
export function hasCyware(c = getConfig()): boolean {
  return Boolean(c.cyware.baseUrl && (c.cyware.apiKey || c.cyware.clientSecret));
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
