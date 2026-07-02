# Enterprise setup — Auth0, RBAC, and integrations

This guide covers production configuration for **AI Support Studio** enterprise features: login, role-based access, encrypted integration credentials, Zendesk/Confluence/Slack connectors, and Slack thread investigations.

---

## Overview

| Layer | Purpose |
|-------|---------|
| **Auth0** | Identity (login, SSO). Roles are stored in the app user store, not Auth0 groups. |
| **RBAC** | Route-level permissions on `/api/support/*` (see [Permissions](#permissions)). |
| **Postgres** | Durable users, encrypted credentials, and integration audit log when `DATABASE_URL` is set. |
| **Credential store** | AES-GCM encrypted integration secrets (Postgres or local `.data/` fallback). |
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

### 4. Invite-only access (required for production)

This app is **strictly invite-only**. Auth0 proves identity (Google or company email); the app decides access.

| Rule | Enforcement |
|------|-------------|
| Email must be invited or an active user | Auth0 Post-Login Action + `/api/auth/invite-check` + session gate |
| No public signup | Disable sign-ups on Auth0 database connections; no auto-provision in app |
| Role from invite | Assigned on first login — users cannot self-select roles |

**Environment variables:**

```bash
AUTH0_ACTION_SHARED_SECRET=   # 32+ char random — Auth0 Action → POST /api/auth/invite-check
BOOTSTRAP_OWNER_EMAIL=        # Optional one-time first owner when user table is empty
AUTH0_GOOGLE_CONNECTION=      # Optional — Auth0 Google connection name for login button
AUTH0_EMAIL_CONNECTION=       # Optional — company email/passwordless/SSO connection name
INVITE_DEFAULT_EXPIRY_DAYS=7
```

**Auth0 Post-Login Action:** copy `docs/auth0-post-login-invite-action.js` into Auth0 Dashboard → Actions → Login → Post-Login. Add secrets `APP_BASE_URL` and `AUTH0_ACTION_SHARED_SECRET`.

**Admin workflow:** Settings → Users → invite by email, assign role, copy invite link. Pending invites can be resent or revoked.

**First production owner:** either set `BOOTSTRAP_OWNER_EMAIL` before first login, or seed an owner invite via API/database.

### 5. Roles (after invite acceptance)

- Admins change roles in **Settings → Users** (`/api/auth/users`, requires `users:write`).
- Roles: `owner`, `admin`, `developer`, `support_agent`, `viewer`.
- With **`DATABASE_URL`** set, users and invites persist across Vercel deploys. Without it, local `.data/` files are used (dev only).

### 6. Google social login (optional)

Use this when you want **Continue with Google** on the login page. **Google login still requires an invite** — it only proves identity.

#### Step 1 — Google Cloud Console

1. Open [Google Cloud Console](https://console.cloud.google.com/) → select or create a project.
2. **APIs & Services → OAuth consent screen**
   - User type: **External** (or Internal for Google Workspace)
   - App name, support email, developer contact — fill required fields
   - Scopes: add `email`, `profile`, `openid` (defaults are fine)
   - Add test users while in **Testing** mode, or **Publish** the app for production
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Name: `AI Support Studio`
   - **Authorized JavaScript origins:**
     - `http://localhost:3000`
     - `https://ai-support-agent-ecru.vercel.app` (your production URL)
   - **Authorized redirect URIs:** (Auth0 callback — not your app URL)
     - `https://dev-jthpufxs5d58hkiu.us.auth0.com/login/callback`
     - Replace with your Auth0 tenant domain if different (`https://{AUTH0_DOMAIN}/login/callback`)
4. Copy the **Client ID** and **Client Secret**.

#### Step 2 — Auth0 Dashboard

1. **Authentication → Social → Google**
2. Paste your Google **Client ID** and **Client Secret**
3. **Save** — the **Dev Keys** warning disappears once custom credentials are saved.

#### Step 3 — Enable for your application

1. **Applications → AI Support Studio → Connections**
2. Toggle **Google / Gmail** (`google-oauth2`) **on**
3. Save

#### Step 4 — Verify

1. Open `{APP_BASE_URL}/auth/login`
2. Confirm **Continue with Google** appears with **no** Dev Keys alert
3. Complete a Google login and confirm you return to the app

### 6. Security hardening (production)

**Dev Keys alert on login:** Auth0 shows this when **Google** (or another social provider) uses Auth0’s shared development OAuth keys. For production:

- **Recommended:** Auth0 Dashboard → **Applications** → *AI Support Studio* → **Connections** → disable **Google** until you add your own Google Cloud OAuth client ID/secret under **Authentication → Social → Google**.
- Email/password (**Username-Password-Authentication**) does not use dev keys and is safe for production.

**Application settings to verify:**

| Setting | Recommended value |
|---------|-------------------|
| Grant types | `authorization_code`, `refresh_token` only (remove `implicit`, `client_credentials`) |
| Token endpoint auth | `client_secret_post` |
| Cross-Origin Authentication | Off |
| Callback / logout URLs | Exact origins only — no wildcards |

**Vercel production checklist:**

- Set `AUTH0_*`, `APP_BASE_URL`, `INTEGRATION_SECRET_KEY`
- Do **not** set `TEST_MODE`, `AUTH_DISABLED`, or `NEXT_PUBLIC_TEST_MODE`
- Rotate `AUTH0_SECRET` / `INTEGRATION_SECRET_KEY` if they were ever committed or shared

**"The state parameter is invalid" on `/auth/callback`:** The OAuth transaction cookie (`__txn_*`) was missing, expired, or could not be decrypted. Common causes and fixes:

| Cause | Fix |
|-------|-----|
| Clicked **Continue with SSO** via client-side navigation | Use a normal link to `/auth/login` (full page load). The `/login` page is fixed to do this. |
| `APP_BASE_URL` missing or wrong on Vercel | Set exactly `https://ai-support-agent-ecru.vercel.app` (no trailing slash). Must match Auth0 Allowed Callback URLs. |
| `AUTH0_SECRET` changed mid-login or too short | Use a stable 32+ character secret. Do not rotate while users are logging in. |
| Login took longer than ~2 hours | Start sign-in again from `/login`. |
| Auth0 callback URL mismatch | Auth0 → Application → Allowed Callback URLs must include `{APP_BASE_URL}/auth/callback` exactly. |

After a failed callback, the app redirects to `/login` with a friendly message instead of a blank error page.

**Permanent fix (v88b2617+):** `/auth/login` returns a **200 HTML bridge page** that stores the OAuth transaction cookie before redirecting to Auth0 (browsers often drop cookies on immediate 307 redirects to external sites). If the cookie is still missing on callback, the app **restores it from Postgres** (`oauth_transactions` table — auto-created when `DATABASE_URL` is set). Run `npm run db:migrate` once if you manage schema manually.

---

## Persistent database (production)

Vercel serverless has **no durable filesystem**. Without Postgres, user roles and saved integration credentials reset on deploy. Set **`DATABASE_URL`** to enable enterprise persistence.

### Recommended: Neon (works with Vercel)

1. Create a free database at [neon.tech](https://neon.tech) (or use **Vercel → Storage → Postgres**).
2. Copy the connection string (`postgres://...` or `postgresql://...`).
3. Add to **Vercel → Environment Variables**:
   ```bash
   DATABASE_URL=postgres://user:pass@host/db?sslmode=require
   ```
4. Apply schema (once per database):
   ```bash
   DATABASE_URL="postgres://..." npm run db:migrate
   ```
   Schema also auto-applies on first request if you skip this step.

### What Postgres stores

| Table | Purpose |
|-------|---------|
| `app_users` | Auth0 user IDs, emails, RBAC roles, org membership |
| `integration_credentials` | AES-GCM encrypted integration secrets from Settings |
| `integration_audit_log` | Who changed which integration and when |

### Local development

- **Without `DATABASE_URL`:** uses `.data/` JSON files (fine for dev and tests).
- **With `DATABASE_URL`:** uses the same Postgres backend as production.

### Verify persistence

After deploy, call `GET /api/support/status` (requires login). Check:

```json
"persistence": {
  "postgres": {
    "configured": true,
    "reachable": true,
    "userStore": "postgres",
    "credentialStore": "postgres"
  }
}
```

### Migrate existing local users (optional)

If you have users in `.data/users.json` from local testing, re-assign roles in **Settings → User Management** after first production login, or run a one-time import script against Postgres.

---

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

Health checks: **Test** button → `POST /api/integrations/{type}` with `action: "test"` or legacy `POST /api/integrations` with `action: "health_check"`.

### Enterprise API routes

| Integration | Route | Notes |
|-------------|-------|-------|
| All four | `GET/POST /api/integrations/{slack\|confluence\|zendesk\|jira}` | Status, configure, test, disconnect |
| Slack | `POST /api/integrations/slack/test-message` | Send test message to channel |
| Slack | `POST /api/integrations/slack/events` | Alias of `/api/slack/events` |
| Confluence | `GET/POST /api/integrations/confluence/pages` | Search (`?q=`) / read page |
| Confluence | `GET/POST /api/integrations/confluence/sync` | Sync spaces into knowledge index |
| Zendesk | `GET/POST /api/integrations/zendesk/tickets` | Search / read ticket |
| Zendesk | `POST /api/integrations/zendesk/actions` | Link, draft, approval-gated writes |
| Jira | `GET /api/integrations/jira/issues` | Search / read (Support can search linked issues) |
| Jira | `POST /api/integrations/jira/actions` | Link, draft create, approval-gated writes |

**Custom Jira** configure/disconnect requires **`integrations:write`** plus **`developer:mode`** (Owner, Admin, Developer). Support Mode users see a friendly message; the server returns `403` on configure attempts.

External writes (Zendesk reply/note/create, Jira create/comment/transition) always enqueue an approval — never execute directly from the investigation UI.

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
| Event Subscriptions | `{APP_BASE_URL}/api/slack/events` or `{APP_BASE_URL}/api/integrations/slack/events` |
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

1. Set Auth0 + `APP_BASE_URL` + `INTEGRATION_SECRET_KEY` + **`DATABASE_URL`** on Vercel
2. Run `npm run db:migrate` against production Postgres (once)
3. Push to `main` (or run `npm run deploy:prod`)
4. Confirm `/login` redirects to Auth0 when auth is enabled
5. Assign roles to team members in User Management
6. Configure integrations (env or Settings)
7. Point Slack Event + Interactivity URLs at production
8. Smoke test: search, investigation, approval, Slack mention

---

## Enterprise polish features

The following admin surfaces are available under **Settings** (Developer/Admin mode with `audit:read` where noted):

| Section | API | Purpose |
|---------|-----|---------|
| **Integrations** | `GET /api/support/enterprise/health` | Integration health cards + degraded summaries |
| **System health** | same | Open/resolved operational events |
| **Audit logs** | `GET /api/support/audit` | Unified Postgres/file audit trail |
| **Setup checklist** | `GET /api/support/enterprise/setup` | Real-status onboarding checklist |
| **Knowledge sources** | `GET/POST /api/support/enterprise/knowledge` | Confluence sync + RAG index status |
| **Notifications** | `GET /api/support/enterprise/notifications` | In-app alerts (Postgres when configured) |
| **Data retention** | `GET/POST /api/support/enterprise/retention` | Retention policy + deletion controls |

### Postgres tables (enterprise)

When `DATABASE_URL` is set, `npm run db:migrate` creates:

- `approval_requests` — durable approval queue
- `audit_logs` — unified audit (legacy JSONL still written as fallback)
- `system_health_events` — operational incidents
- `slack_conversations` — thread memory keyed by team/channel/thread
- `knowledge_sources` — Confluence and other RAG sources
- `investigation_links` — Zendesk/Jira/Slack/Confluence artifact links
- `app_notifications` — per-user notifications
- `retention_settings` — org retention policy

Without Postgres, the same models persist under `.data/enterprise/` for local dev.

### Approval hardening

External writes require a persisted **approval request ID** in production (`approvalId` passed to `executeAction`). `TEST_MODE` retains the legacy `approved: true` shortcut for E2E.

### Support vs Developer/Admin Mode

- **Support Mode** (`client`): investigations, customer response, friendly integration status
- **Developer/Admin Mode** (`developer`): terminal, MCP, system health, env details, audit logs

RBAC remains server-side; UI hiding is not a security control.

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
