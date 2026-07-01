#!/usr/bin/env node
/**
 * Apply Postgres schema for enterprise persistence (users, credentials, audit).
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

console.log("Schema applied successfully.");
