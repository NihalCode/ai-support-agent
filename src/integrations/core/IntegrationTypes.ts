/** Integration identifiers for enterprise connectors (Phase A registry). */

export const INTEGRATION_IDS = [
  "jira",
  "zendesk",
  "confluence",
  "slack",
  "github",
  "vercel",
  "ctix",
  "csap",
  "cftr",
  "orchestrate",
  "openai",
  "pinecone",
] as const;

export type IntegrationId = (typeof INTEGRATION_IDS)[number];

export type IntegrationCategory =
  | "ticketing"
  | "docs"
  | "chat"
  | "devops"
  | "cyware"
  | "ai";

export interface IntegrationDefinition {
  id: IntegrationId;
  name: string;
  category: IntegrationCategory;
  description: string;
  /** Env var keys used when credential store is empty (legacy path). */
  envKeys: string[];
  supportsHealthCheck: boolean;
  supportsWrite: boolean;
}

export interface IntegrationStatus {
  id: IntegrationId;
  name: string;
  category: IntegrationCategory;
  configured: boolean;
  source: "env" | "store" | "mock";
  health: "unknown" | "healthy" | "degraded" | "error";
  detail?: string;
  lastCheckedAt?: string;
}

export interface IntegrationCredentialPayload {
  [key: string]: string;
}
