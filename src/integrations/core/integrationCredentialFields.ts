import type { IntegrationId } from "./IntegrationTypes";

export interface CredentialFieldDef {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
  optional?: boolean;
}

/** Form fields for Settings → Integrations credential save (matches store payload keys). */
export const INTEGRATION_CREDENTIAL_FIELDS: Partial<
  Record<IntegrationId, CredentialFieldDef[]>
> = {
  jira: [
    { key: "baseUrl", label: "Base URL", placeholder: "https://your-org.atlassian.net" },
    { key: "email", label: "Account email" },
    { key: "apiToken", label: "API token", secret: true },
    { key: "projectKey", label: "Default project key", optional: true },
  ],
  zendesk: [
    { key: "subdomain", label: "Subdomain", placeholder: "your-company" },
    { key: "email", label: "Agent email" },
    { key: "apiToken", label: "API token", secret: true },
  ],
  confluence: [
    { key: "baseUrl", label: "Base URL", placeholder: "https://your-org.atlassian.net/wiki" },
    { key: "email", label: "Account email" },
    { key: "apiToken", label: "API token", secret: true },
    { key: "spaceKey", label: "Space key", optional: true },
  ],
  slack: [
    { key: "botToken", label: "Bot token (xoxb-…)", secret: true },
    { key: "signingSecret", label: "Signing secret", secret: true },
  ],
  github: [{ key: "token", label: "Personal access token", secret: true }],
  vercel: [
    { key: "token", label: "Vercel token", secret: true },
    { key: "projectId", label: "Project ID" },
    { key: "teamId", label: "Team ID", optional: true },
  ],
  openai: [{ key: "apiKey", label: "API key", secret: true }],
  pinecone: [{ key: "apiKey", label: "API key", secret: true }],
  ctix: [
    { key: "baseUrl", label: "CTIX base URL" },
    { key: "clientId", label: "Access ID" },
    { key: "clientSecret", label: "Secret key", secret: true },
  ],
  csap: [
    { key: "baseUrl", label: "CSAP base URL" },
    { key: "apiKey", label: "API key", secret: true },
  ],
  cftr: [
    { key: "baseUrl", label: "CFTR base URL" },
    { key: "apiKey", label: "API key", secret: true },
  ],
  orchestrate: [
    { key: "baseUrl", label: "Orchestrate base URL" },
    { key: "apiKey", label: "API key", secret: true },
  ],
};

export function credentialFieldsFor(id: IntegrationId): CredentialFieldDef[] {
  return INTEGRATION_CREDENTIAL_FIELDS[id] ?? [];
}
