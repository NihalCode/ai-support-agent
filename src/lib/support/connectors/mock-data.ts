import type { RepoFile, NormalizedIssue, CommitInfo } from "../types";

/**
 * Realistic mock dataset used when no GitHub/Jira credentials are configured.
 * Models a small Next.js "Acme Checkout" service so the 8 example test cases
 * have real code, docs, issues, and tickets to retrieve against.
 */

export const MOCK_REPO = { owner: "acme", name: "checkout-service", branch: "main" };

export const MOCK_FILES: RepoFile[] = [
  {
    path: "README.md",
    language: "markdown",
    size: 700,
    lastCommit: "a1b2c3d",
    content: `# Acme Checkout Service

A Next.js payment checkout API.

## Setup

1. Copy \`.env.example\` to \`.env.local\`.
2. Set \`STRIPE_SECRET_KEY\`, \`DATABASE_URL\`, and \`PAYMENT_API_BASE\`.
3. \`npm install\`
4. \`npm run dev\`

## Environment variables

| Name | Required | Notes |
|------|----------|-------|
| STRIPE_SECRET_KEY | yes | Server-side Stripe key |
| DATABASE_URL | yes | Postgres connection string |
| PAYMENT_API_BASE | yes | Base URL of the payments API. Must end with /v2 |

## Common errors

- "Missing STRIPE_SECRET_KEY" — you forgot to set the env var.
- 404 on /api/charge — make sure PAYMENT_API_BASE ends with /v2 (the API was migrated from /v1 in v3.0).
`,
  },
  {
    path: "src/config/env.ts",
    language: "typescript",
    size: 420,
    lastCommit: "a1b2c3d",
    content: `export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(\`Missing \${name}. See README env table.\`);
  }
  return value;
}

export const config = {
  stripeKey: requireEnv("STRIPE_SECRET_KEY"),
  databaseUrl: requireEnv("DATABASE_URL"),
  paymentApiBase: requireEnv("PAYMENT_API_BASE"),
};
`,
  },
  {
    path: "src/api/charge.ts",
    language: "typescript",
    size: 600,
    lastCommit: "f4e5d6c",
    content: `import { config } from "../config/env";
import { formatAmount } from "../lib/money";

// Charges a customer. Calls the payments API which migrated to /v2 in v3.0.
export async function charge(customerId: string, amountCents: number) {
  const url = \`\${config.paymentApiBase}/charge\`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${config.stripeKey}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ customerId, amount: formatAmount(amountCents) }),
  });
  if (res.status === 404) {
    throw new Error("Charge endpoint not found — is PAYMENT_API_BASE pointing at /v2?");
  }
  if (!res.ok) {
    throw new Error(\`Charge failed: \${res.status}\`);
  }
  return res.json();
}
`,
  },
  {
    path: "src/lib/money.ts",
    language: "typescript",
    size: 300,
    lastCommit: "b7c8d9e",
    content: `import currency from "currency.js";

// Formats integer cents into a decimal string. Requires the "currency.js" dependency.
export function formatAmount(cents: number): string {
  return currency(cents, { fromCents: true }).format();
}
`,
  },
  {
    path: "src/api/webhook.ts",
    language: "typescript",
    size: 380,
    lastCommit: "c9d0e1f",
    content: `import { config } from "../config/env";

// Verifies and handles Stripe webhooks. Signature header is required.
export async function handleWebhook(rawBody: string, signature: string | null) {
  if (!signature) {
    throw new Error("Missing Stripe-Signature header");
  }
  // ... signature verification using config.stripeKey ...
  return { received: true };
}
`,
  },
  {
    path: "docs/deployment.md",
    language: "markdown",
    size: 350,
    lastCommit: "d1e2f3a",
    content: `# Deployment

Deploy to Vercel. Set all env vars in Project Settings.

> Note: the payments API base changed from /v1 to /v2 in release v3.0.
> Old deployments pointing at /v1 will get 404 on /api/charge.

Node 18+ is required. Node 16 is no longer supported.
`,
  },
];

export const MOCK_COMMITS: CommitInfo[] = [
  { sha: "f4e5d6c", message: "fix(charge): migrate payments API to /v2 (#41)", author: "dev1", date: "2026-03-01", files: ["src/api/charge.ts"] },
  { sha: "b7c8d9e", message: "feat(money): add currency.js formatting", author: "dev2", date: "2026-02-20", files: ["src/lib/money.ts"] },
  { sha: "a1b2c3d", message: "docs: document required env vars", author: "dev1", date: "2026-02-10", files: ["README.md", "src/config/env.ts"] },
];

export const MOCK_GITHUB_ISSUES: NormalizedIssue[] = [
  {
    id: "gh#41",
    source: "github",
    number: 41,
    title: "Charge endpoint returns 404 after upgrade",
    body: "After upgrading to v3.0, all calls to /api/charge return 404. Was working before.",
    state: "closed",
    labels: ["bug", "payments"],
    assignee: "dev1",
    author: "customer-acme",
    comments: [
      { author: "dev1", body: "The payments API moved from /v1 to /v2 in v3.0. Update PAYMENT_API_BASE to end with /v2." },
      { author: "customer-acme", body: "That fixed it, thanks!" },
    ],
    linkedPRs: ["gh#42"],
    linkedCommits: ["f4e5d6c"],
    url: "https://github.com/acme/checkout-service/issues/41",
    createdAt: "2026-03-01",
    updatedAt: "2026-03-02",
  },
  {
    id: "gh#42",
    source: "github",
    number: 42,
    title: "PR: migrate payments API base to /v2",
    body: "Fixes #41. Updates charge.ts and docs to use /v2.",
    state: "merged",
    labels: ["payments"],
    assignee: "dev1",
    author: "dev1",
    comments: [],
    linkedCommits: ["f4e5d6c"],
    url: "https://github.com/acme/checkout-service/pull/42",
    createdAt: "2026-03-01",
    updatedAt: "2026-03-01",
  },
  {
    id: "gh#55",
    source: "github",
    number: 55,
    title: "Cannot start app: Missing STRIPE_SECRET_KEY",
    body: "App crashes on boot with 'Missing STRIPE_SECRET_KEY. See README env table.'",
    state: "closed",
    labels: ["question", "configuration"],
    author: "customer-beta",
    comments: [
      { author: "support", body: "This is a config issue — set STRIPE_SECRET_KEY in .env.local as described in the README." },
    ],
    url: "https://github.com/acme/checkout-service/issues/55",
    createdAt: "2026-04-10",
  },
  {
    id: "gh#60",
    source: "github",
    number: 60,
    title: "Module not found: Can't resolve 'currency.js'",
    body: "Build fails with: Module not found: Error: Can't resolve 'currency.js' in src/lib.",
    state: "open",
    labels: ["bug", "dependencies"],
    author: "customer-gamma",
    comments: [],
    url: "https://github.com/acme/checkout-service/issues/60",
    createdAt: "2026-05-02",
  },
  {
    id: "gh#71",
    source: "github",
    number: 71,
    title: "Please add support for PayPal payments",
    body: "We would love to use PayPal in addition to Stripe. Is this on the roadmap?",
    state: "open",
    labels: ["enhancement"],
    author: "customer-delta",
    comments: [],
    url: "https://github.com/acme/checkout-service/issues/71",
    createdAt: "2026-05-20",
  },
];

export const MOCK_JIRA_ISSUES: NormalizedIssue[] = [
  {
    id: "PAY-101",
    source: "jira",
    key: "PAY-101",
    title: "Webhook handler intermittently rejects valid events",
    body: "Some valid Stripe webhooks are rejected with 'Missing Stripe-Signature header' even though the header is present behind our proxy.",
    state: "In Progress",
    labels: ["bug", "webhook"],
    assignee: "dev2",
    author: "support",
    comments: [
      { author: "dev2", body: "Proxy may be stripping the Stripe-Signature header. Investigating — likely an infra/proxy config, needs engineering." },
    ],
    linkedCommits: ["c9d0e1f"],
    url: "https://acme.atlassian.net/browse/PAY-101",
    createdAt: "2026-05-15",
  },
  {
    id: "PAY-118",
    source: "jira",
    key: "PAY-118",
    title: "Node 16 deployments fail to boot",
    body: "Customer on Node 16 reports the service won't start after v3.1.",
    state: "Done",
    labels: ["environment"],
    assignee: "dev1",
    author: "support",
    comments: [
      { author: "dev1", body: "Node 16 is EOL and unsupported since v3.0. Upgrade to Node 18+." },
    ],
    url: "https://acme.atlassian.net/browse/PAY-118",
    createdAt: "2026-04-22",
  },
];
