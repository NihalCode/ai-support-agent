# Enterprise setup — Auth0, RBAC, and integrations

This guide covers production configuration for **AI Support Studio** enterprise features: login, role-based access, encrypted integration credentials, Zendesk/Confluence/Slack connectors, and Slack thread investigations.

---

## Overview

| Layer | Purpose |
|-------|---------|
| **Auth0** | Identity (login, SSO). Roles are stored in the app user store, not Auth0 groups. |
| **RBAC** | Route-level permissions on `/api/support/*` (see [Permissions](#permissions)). |
| **Credential store** | AES-GCM encrypted `.data/integration-credentials.json` (server-side only). |
| **Env fallback** | Legacy `JIRA_*`, `ZENDESK_*`, `SLACK_*`, etc. still work when the store is empty. |

When Auth0 env vars are **unset** (or `AUTH_DISABLED=true`, or `TEST_MODE=true`), the app runs without login and grants an implicit **owner** session for local development and E2E tests.

---

## Auth0 setup

### 1. Create an Auth0 application

1. Auth0 Dashboard → **Applications** → **Create Application**
2. Type: **Regular Web Application**
3. Note **Domain**, **Client ID**, and **Client Secret**

### 2. Configure URLs

Replace `{APP_BASE_URL}` with your deployed origin (e.g. `https://ai-support-agent-ecru.vercel.app`):

| Setting | Value |
|---------|--------|
| Allowed Callback URLs | `{APP_BASE_URL}/auth/callback` |
| Allowed Logout URLs | `{APP_BASE_URL}` |
| Allowed Web Origins | `{APP_BASE_URL}` |

### 3. Environment variables

```bash
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_CLIENT_ID=
AUTH0_CLIENT_SECRET=
AUTH0_SECRET=   # 32+ char random string (session encryption)
APP_BASE_URL=https://your-app.vercel.app
DEFAULT_ORG_ID=default
```

Generate `AUTH0_SECRET`:

```bash
openssl rand -hex 32
```

Optional:

```bash
AUTH_DISABLED=false   # force auth off even when Auth0 is configured
```

### 4. First login and roles

- First user to log in is upserted into `.data/users.json` with role **`owner`** (unless pre-provisioned).
- Admins change roles in **Settings → User Management** (`/api/auth/users`, requires `users:write`).
- Roles: `owner`, `admin`, `developer`, `support_agent`, `viewer`.

---

## Permissions

| Permission | Typical use |
|------------|-------------|
| `app:use` | Search, chat, investigations (read), tickets, analyze |
| `investigate:write` | Run investigations, ingest, knowledge sources |
| `approvals:write` | Approvals queue, writes, API/Cyware execute |
| `build:write` | Build App workspace |
| `developer:mode` | Terminal, MCP, API import, CQL index, eval tests |
| `integrations:read` / `integrations:write` | Integration settings |
| `users:read` / `users:write` | User management |
| `audit:read` | Audit log API |

Middleware requires a valid Auth0 session for all `/api/*` routes **except** `/api/slack/*` (Slack verifies its own request signatures).

Each `/api/support/*` handler additionally checks the permission above via `requireSupportApi()`.

---

## Integration credentials

### Option A — Environment variables (simple)

Set vars in Vercel or `.env.local` (see `.env.example`). Connectors read env when the encrypted store has no entry for that integration.

### Option B — Encrypted store (Settings UI)

1. Set **`INTEGRATION_SECRET_KEY`** (32+ chars; can reuse `AUTH0_SECRET` as fallback).
2. Log in as a user with **`integrations:write`**.
3. Open **Settings → Integrations** → **Configure** on an integration → **Save credentials**.

Stored credentials **override** env for Jira, Zendesk, Confluence, and Slack at runtime.

### Supported integrations (Settings forms)

| ID | Fields |
|----|--------|
| `jira` | baseUrl, email, apiToken, projectKey (optional) |
| `zendesk` | subdomain, email, apiToken |
| `confluence` | baseUrl, email, apiToken, spaceKey (optional) |
| `slack` | botToken, signingSecret |
| `github`, `vercel`, Cyware products, `openai`, `pinecone` | See Settings form labels |

Health checks: **Test** button → `POST /api/integrations` with `action: "health_check"`.

---

## Slack bot

### Slack app configuration

1. [api.slack.com/apps](https://api.slack.com/apps) → **Create New App**
2. **OAuth & Permissions** → Bot Token Scopes:
   - `app_mentions:read`
   - `chat:write`
   - `channels:history` (public channels)
   - `groups:history` (optional, private channels)
3. Install to workspace → copy **Bot User OAuth Token** (`xoxb-…`)
4. **Basic Information** → **Signing Secret**

### Request URLs

| Event | URL |
|-------|-----|
| Event Subscriptions | `{APP_BASE_URL}/api/slack/events` |
| Interactivity | `{APP_BASE_URL}/api/slack/interactions` |

Subscribe to bot events: `app_mention`, `message.channels` (and/or `message.groups`).

### Credentials

Either env:

```bash
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
```

Or save via **Settings → Integrations → Slack**.

### Thread investigations

When a user mentions the bot or posts in a tracked thread:

1. Message is stored in `.data/slack/threads.json`
2. **`enrichSlackThread`** runs a full investigation (first actionable message) or follow-up chat (if a session is linked)
3. Summary is posted back to the thread with a link to AI Support Studio when `APP_BASE_URL` is set

Approval cards: create an approval with optional `slack: { channel, threadTs }` in `POST /api/support/approvals`.

---

## Zendesk & Confluence (Phase B)

Env or Settings store — same pattern as Jira.

```bash
ZENDESK_SUBDOMAIN=
ZENDESK_EMAIL=
ZENDESK_API_TOKEN=

CONFLUENCE_BASE_URL=
CONFLUENCE_EMAIL=
CONFLUENCE_API_TOKEN=
CONFLUENCE_SPACE_KEY=
```

Bootstrap auto-imports Confluence/mock knowledge into the `knowledge` Pinecone namespace when empty (`AUTO_IMPORT_ENTERPRISE_KNOWLEDGE`, default on).

---

## Deployment checklist

1. Set Auth0 + `APP_BASE_URL` + `INTEGRATION_SECRET_KEY` on Vercel
2. Push to `main` (or run `npm run deploy:prod`)
3. Confirm `/login` redirects to Auth0 when auth is enabled
4. Assign roles to team members in User Management
5. Configure integrations (env or Settings)
6. Point Slack Event + Interactivity URLs at production
7. Smoke test: search, investigation, approval, Slack mention

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| `401` on API calls | Auth0 session expired; middleware requires login for `/api/support/*` |
| `403 Forbidden` | User role lacks permission (e.g. viewer cannot run terminal) |
| Slack `401` signature | `SLACK_SIGNING_SECRET` mismatch; store vs env precedence |
| Integrations show mock | Credentials missing in both store and env |
| Save credentials fails | `INTEGRATION_SECRET_KEY` not set on server |

For local development without Auth0, omit Auth0 vars — the app uses a mock **owner** session automatically.
