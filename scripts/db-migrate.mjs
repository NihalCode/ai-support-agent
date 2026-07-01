#!/usr/bin/env node
/**
 * Apply Postgres schema for enterprise persistence.
 * Usage: DATABASE_URL=postgres://... node scripts/db-migrate.mjs
 */
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL is required");
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

console.log("Schema applied successfully.");
