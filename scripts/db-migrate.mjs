#!/usr/bin/env node
/**
 * Apply Postgres schema for enterprise persistence.
 * Loads DATABASE_URL from .env.local when not set in the shell.
 * Usage: npm run db:migrate
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, key, raw] = m;
    if (!process.env[key]) {
      process.env[key] = raw.replace(/^["']|["']$/g, "");
    }
  }
}

loadEnvLocal();

const url =
  process.env.DATABASE_URL?.trim() ||
  process.env.DATABASE_POSTGRES_URL?.trim();
if (!url) {
  console.error("DATABASE_URL is required (set in .env.local or shell)");
  process.exit(1);
}

const sql = neon(url);

console.log("Applying schema…");

await sql`
  CREATE TABLE IF NOT EXISTS app_users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT,
    role TEXT NOT NULL,
    org_id TEXT NOT NULL DEFAULT 'default',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at TIMESTAMPTZ,
    UNIQUE (org_id, email)
  )
`;
await sql`CREATE INDEX IF NOT EXISTS idx_app_users_org ON app_users (org_id)`;

await sql`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS invited_by_user_id TEXT`;
await sql`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS accepted_invite_at TIMESTAMPTZ`;
await sql`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS picture TEXT`;

await sql`
  CREATE TABLE IF NOT EXISTS user_invites (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT 'default',
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    invited_by_user_id TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;
await sql`
  CREATE INDEX IF NOT EXISTS idx_user_invites_org_status
  ON user_invites (org_id, status, created_at DESC)
`;
await sql`
  CREATE INDEX IF NOT EXISTS idx_user_invites_email
  ON user_invites (org_id, email)
`;
await sql`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_user_invites_token_hash
  ON user_invites (token_hash)
`;

await sql`
  CREATE TABLE IF NOT EXISTS integration_credentials (
    integration_id TEXT NOT NULL,
    org_id TEXT NOT NULL DEFAULT 'default',
    encrypted TEXT NOT NULL,
    iv TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT NOT NULL,
    PRIMARY KEY (integration_id, org_id)
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS integration_audit_log (
    id TEXT PRIMARY KEY,
    at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    org_id TEXT NOT NULL DEFAULT 'default',
    actor_id TEXT NOT NULL,
    actor_email TEXT NOT NULL,
    action TEXT NOT NULL,
    integration_id TEXT NOT NULL,
    detail TEXT
  )
`;
await sql`
  CREATE INDEX IF NOT EXISTS idx_integration_audit_org_at
  ON integration_audit_log (org_id, at DESC)
`;

await sql`
  CREATE TABLE IF NOT EXISTS approval_requests (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT 'default',
    requested_by_user_id TEXT NOT NULL DEFAULT 'system',
    approved_by_user_id TEXT,
    action_type TEXT NOT NULL,
    target_system TEXT NOT NULL,
    target_id TEXT,
    risk_level TEXT NOT NULL DEFAULT 'medium',
    summary TEXT NOT NULL,
    payload_preview JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL,
    action_json JSONB NOT NULL,
    safety_json JSONB NOT NULL,
    preview TEXT NOT NULL,
    result TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
  )
`;
await sql`CREATE INDEX IF NOT EXISTS idx_approval_requests_org_status ON approval_requests (org_id, status, created_at DESC)`;

await sql`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT 'default',
    actor_user_id TEXT NOT NULL DEFAULT 'system',
    actor_email TEXT,
    action TEXT NOT NULL,
    target_system TEXT NOT NULL DEFAULT 'app',
    target_id TEXT,
    status TEXT NOT NULL DEFAULT 'completed',
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;
await sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_org_at ON audit_logs (org_id, created_at DESC)`;

await sql`
  CREATE TABLE IF NOT EXISTS system_health_events (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT 'default',
    source TEXT NOT NULL,
    severity TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    technical_details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
  )
`;
await sql`CREATE INDEX IF NOT EXISTS idx_system_health_org_status ON system_health_events (org_id, status, created_at DESC)`;

await sql`
  CREATE TABLE IF NOT EXISTS slack_conversations (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT 'default',
    slack_team_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    thread_ts TEXT NOT NULL,
    slack_user_id TEXT NOT NULL DEFAULT '',
    app_user_id TEXT,
    investigation_id TEXT,
    investigation_session_id TEXT,
    last_intent TEXT,
    messages_json JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, slack_team_id, channel_id, thread_ts)
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS slack_event_dedup (
    dedup_key TEXT PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS knowledge_sources (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT 'default',
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    external_id TEXT,
    url TEXT,
    status TEXT NOT NULL DEFAULT 'stale',
    last_synced_at TIMESTAMPTZ,
    created_by_user_id TEXT NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS investigation_links (
    investigation_id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT 'default',
    source_system TEXT,
    zendesk_ticket_id TEXT,
    jira_issue_key TEXT,
    slack_thread_id TEXT,
    confluence_source_ids JSONB,
    customer_summary TEXT,
    developer_handoff TEXT,
    customer_response TEXT,
    root_cause TEXT,
    confidence TEXT,
    assigned_to_user_id TEXT,
    created_by_user_id TEXT NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS app_notifications (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT 'default',
    user_id TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'info',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    technical_message TEXT,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;
await sql`CREATE INDEX IF NOT EXISTS idx_app_notifications_user ON app_notifications (org_id, user_id, read, created_at DESC)`;

await sql`
  CREATE TABLE IF NOT EXISTS retention_settings (
    org_id TEXT PRIMARY KEY DEFAULT 'default',
    investigation_retention_days INT,
    slack_conversation_retention_days INT,
    audit_log_retention_days INT,
    knowledge_source_refresh_days INT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS oauth_transactions (
    state TEXT PRIMARY KEY,
    cookie_name TEXT NOT NULL,
    cookie_value TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
  )
`;
await sql`
  CREATE INDEX IF NOT EXISTS idx_oauth_transactions_expires
  ON oauth_transactions (expires_at)
`;

await sql`
  CREATE TABLE IF NOT EXISTS integrations (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT 'default',
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_connected',
    metadata JSONB NOT NULL DEFAULT '{}',
    created_by_user_id TEXT NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, type)
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS integration_health_checks (
    id TEXT PRIMARY KEY,
    integration_id TEXT NOT NULL,
    org_id TEXT NOT NULL DEFAULT 'default',
    status TEXT NOT NULL,
    message TEXT NOT NULL,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;
await sql`
  CREATE INDEX IF NOT EXISTS idx_integration_health_org
  ON integration_health_checks (org_id, integration_id, checked_at DESC)
`;

await sql`
  CREATE TABLE IF NOT EXISTS knowledge_sync_runs (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT 'default',
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL,
    triggered_by TEXT NOT NULL,
    source_ids JSONB NOT NULL DEFAULT '[]',
    downloaded_count INT NOT NULL DEFAULT 0,
    parsed_count INT NOT NULL DEFAULT 0,
    chunk_count INT NOT NULL DEFAULT 0,
    embedded_count INT NOT NULL DEFAULT 0,
    upserted_count INT NOT NULL DEFAULT 0,
    skipped_unchanged_count INT NOT NULL DEFAULT 0,
    failed_count INT NOT NULL DEFAULT 0,
    error_summary TEXT
  )
`;
await sql`
  CREATE INDEX IF NOT EXISTS idx_knowledge_sync_runs_org_started
  ON knowledge_sync_runs (org_id, started_at DESC)
`;

await sql`
  CREATE TABLE IF NOT EXISTS knowledge_document_states (
    source_id TEXT NOT NULL,
    org_id TEXT NOT NULL DEFAULT 'default',
    url TEXT NOT NULL DEFAULT '',
    checksum TEXT NOT NULL,
    vector_ids JSONB NOT NULL DEFAULT '[]',
    namespace TEXT NOT NULL,
    last_indexed_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    chunk_count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (org_id, source_id)
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS analytics_events (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT 'default',
    event_type TEXT NOT NULL,
    category TEXT NOT NULL,
    actor_user_id TEXT,
    actor_role TEXT,
    duration_ms INT,
    success BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;
await sql`
  CREATE INDEX IF NOT EXISTS idx_analytics_events_org_created
  ON analytics_events (org_id, created_at DESC)
`;
await sql`
  CREATE INDEX IF NOT EXISTS idx_analytics_events_org_type
  ON analytics_events (org_id, event_type, created_at DESC)
`;
await sql`
  CREATE INDEX IF NOT EXISTS idx_analytics_events_org_category
  ON analytics_events (org_id, category, created_at DESC)
`;

await sql`
  CREATE TABLE IF NOT EXISTS daily_metrics_rollups (
    org_id TEXT NOT NULL DEFAULT 'default',
    date DATE NOT NULL,
    metrics JSONB NOT NULL DEFAULT '{}',
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (org_id, date)
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS metrics_settings (
    org_id TEXT PRIMARY KEY DEFAULT 'default',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    retention_days INT NOT NULL DEFAULT 90,
    task_baselines JSONB NOT NULL DEFAULT '{}',
    allow_developer_view BOOLEAN NOT NULL DEFAULT TRUE,
    allow_support_agent_view BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS context_usage_metrics (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT 'default',
    event_id TEXT,
    investigation_id TEXT,
    chunks_retrieved INT NOT NULL DEFAULT 0,
    tokens_estimated INT,
    namespaces JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;
await sql`
  CREATE INDEX IF NOT EXISTS idx_context_usage_org_created
  ON context_usage_metrics (org_id, created_at DESC)
`;

await sql`
  CREATE TABLE IF NOT EXISTS zendesk_tickets (
    org_id TEXT NOT NULL DEFAULT 'default',
    ticket_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'unknown',
    priority TEXT,
    tags JSONB NOT NULL DEFAULT '[]',
    requester_id TEXT,
    assignee_id TEXT,
    comments_json JSONB NOT NULL DEFAULT '[]',
    url TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (org_id, ticket_id)
  )
`;
await sql`
  CREATE INDEX IF NOT EXISTS idx_zendesk_tickets_org_updated
  ON zendesk_tickets (org_id, updated_at DESC)
`;

await sql`
  CREATE TABLE IF NOT EXISTS zendesk_sync_state (
    org_id TEXT PRIMARY KEY DEFAULT 'default',
    last_synced_at TIMESTAMPTZ,
    last_start_time BIGINT,
    ticket_count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

const enterpriseMigration = readFileSync(
  path.join(process.cwd(), "migrations", "20260713_enterprise_control_plane.sql"),
  "utf8"
);
function splitSqlStatements(source) {
  const statements = [];
  let current = "";
  let singleQuoted = false;
  let dollarQuoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const pair = source.slice(index, index + 2);
    if (!singleQuoted && pair === "$$") {
      dollarQuoted = !dollarQuoted;
      current += pair;
      index += 1;
      continue;
    }
    const char = source[index];
    if (!dollarQuoted && char === "'" && source[index - 1] !== "\\") {
      singleQuoted = !singleQuoted;
    }
    if (char === ";" && !singleQuoted && !dollarQuoted) {
      const statement = current.trim();
      if (statement && statement !== "BEGIN" && statement !== "COMMIT") {
        statements.push(statement);
      }
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}
const enterpriseStatements = splitSqlStatements(enterpriseMigration);
await sql.transaction(
  enterpriseStatements.map((statement) => sql.query(statement))
);

console.log("Schema applied successfully.");
