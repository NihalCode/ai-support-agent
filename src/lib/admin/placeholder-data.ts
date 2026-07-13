/** PLACEHOLDER: Documentation Agent control-plane APIs are not wired in this repository yet. */
export const DOCUMENTATION_AGENT_PLACEHOLDER = {
  apis: [
    {
      id: "doc-openapi",
      name: "Runnable docs OpenAPI",
      environment: "staging" as const,
      status: "Draft",
      updatedAt: "2026-07-10T14:22:00.000Z",
    },
    {
      id: "doc-agent-plan",
      name: "Agent planning endpoint",
      environment: "development" as const,
      status: "Active",
      updatedAt: "2026-07-08T09:15:00.000Z",
    },
  ],
  integrations: [
    {
      id: "pinecone",
      name: "Pinecone retrieval",
      status: "Connected",
      lastSync: "2026-07-12T18:40:00.000Z",
    },
    {
      id: "theneo",
      name: "Theneo doc export",
      status: "Scheduled",
      lastSync: "2026-07-11T06:00:00.000Z",
    },
  ],
  keys: [
    {
      id: "doc-key-1",
      name: "CI publish key",
      last4: "8f2a",
      environment: "staging" as const,
      status: "Active",
    },
  ],
};

/** PLACEHOLDER: Security administration endpoints pending Auth0 Organizations integration. */
export const SECURITY_PLACEHOLDER = {
  roles: [
    { id: "owner", name: "Owner", members: 1, permissions: "All enterprise permissions" },
    { id: "admin", name: "Admin", members: 2, permissions: "All enterprise permissions" },
    {
      id: "developer",
      name: "Developer",
      members: 4,
      permissions: "Non-production writes, change submission",
    },
  ],
  serviceAccounts: [
    {
      id: "sa-deploy",
      name: "Deployment worker",
      scopes: ["resources.read", "jobs.read"],
      lastUsed: "2026-07-12T22:10:00.000Z",
    },
  ],
  settings: {
    mfaRequiredForProduction: true,
    sessionTimeoutMinutes: 480,
    ipAllowlistEnabled: false,
  },
};

/** PLACEHOLDER: Shared rate-limit policy store not yet exposed via control-plane API. */
export const RATE_LIMITS_PLACEHOLDER = [
  {
    id: "rl-default",
    name: "Default mutation limit",
    limit: "30 req / 5 min",
    environment: "production" as const,
  },
  {
    id: "rl-search",
    name: "Zendesk test search",
    limit: "10 req / min",
    environment: "production" as const,
  },
];
