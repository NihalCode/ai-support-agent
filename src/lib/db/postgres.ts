import "server-only";

import { getConfig } from "@/lib/support/config";

type NeonSql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<Record<string, unknown>[]>;

let sqlClient: NeonSql | null = null;
let schemaReady: Promise<void> | null = null;

export function isPostgresConfigured(): boolean {
  return Boolean(getConfig().databaseUrl);
}

export function postgresBackendLabel(): "postgres" | "file" {
  return isPostgresConfigured() ? "postgres" : "file";
}

async function getSql(): Promise<NeonSql> {
  const url = getConfig().databaseUrl;
  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (!sqlClient) {
    const { neon } = await import("@neondatabase/serverless");
    sqlClient = neon(url) as NeonSql;
  }
  return sqlClient;
}

async function runSchemaMigrations(sql: NeonSql): Promise<void> {
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
}

/** Idempotent schema bootstrap — safe on every cold start. */
export async function ensurePostgresSchema(): Promise<void> {
  if (!isPostgresConfigured()) return;
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = await getSql();
      await runSchemaMigrations(sql);
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
}

/** Tagged-template Postgres query (schema ensured first). */
export async function pgQuery(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<Record<string, unknown>[]> {
  await ensurePostgresSchema();
  const sql = await getSql();
  return sql(strings, ...values);
}

export async function pingPostgres(): Promise<boolean> {
  if (!isPostgresConfigured()) return false;
  try {
    await pgQuery`SELECT 1 AS ok`;
    return true;
  } catch {
    return false;
  }
}
