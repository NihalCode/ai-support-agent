import "server-only";

/**
 * Central auth/config service. Reads all credentials from environment
 * variables — never hardcode secrets. Every integration is optional; when a
 * credential is missing the corresponding service falls back to a mock/in-memory
 * implementation so the app always runs.
 */

export interface SupportConfig {
  openaiApiKey: string | null;
  pinecone: {
    apiKey: string | null;
    indexName: string;
    cloud: string;
    region: string;
  };
  github: {
    token: string | null;
    defaultRepo: string;
  };
  jira: {
    baseUrl: string | null;
    email: string | null;
    apiToken: string | null;
  };
  readOnly: boolean;
}

function clean(v: string | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

export function getConfig(): SupportConfig {
  return {
    openaiApiKey: clean(process.env.OPENAI_API_KEY),
    pinecone: {
      apiKey: clean(process.env.PINECONE_API_KEY),
      indexName: clean(process.env.PINECONE_INDEX_NAME) ?? "support-agent-rag",
      cloud: clean(process.env.PINECONE_CLOUD) ?? "aws",
      region: clean(process.env.PINECONE_REGION) ?? "us-east-1",
    },
    github: {
      token: clean(process.env.GITHUB_TOKEN),
      defaultRepo: clean(process.env.DEFAULT_GITHUB_REPO) ?? "vercel/next.js",
    },
    jira: {
      baseUrl: clean(process.env.JIRA_BASE_URL),
      email: clean(process.env.JIRA_EMAIL),
      apiToken: clean(process.env.JIRA_API_TOKEN),
    },
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

/** Mask secrets before they ever appear in a response or log. */
export function maskSecret(value: string | null | undefined): string {
  if (!value) return "(unset)";
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}…${value.slice(-2)}`;
}
