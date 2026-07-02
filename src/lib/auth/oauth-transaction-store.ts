import "server-only";

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { ensurePostgresSchema, isPostgresConfigured } from "@/lib/db/postgres";

export interface OAuthTransactionRecord {
  state: string;
  cookieName: string;
  cookieValue: string;
  expiresAt: string;
}

const TTL_MS = 2 * 60 * 60 * 1000;
const FILE_PATH = path.join(process.cwd(), ".data", "oauth-transactions.json");

function fileStorePath(): string {
  mkdirSync(path.dirname(FILE_PATH), { recursive: true });
  return FILE_PATH;
}

function readFileStore(): OAuthTransactionRecord[] {
  try {
    const raw = readFileSync(fileStorePath(), "utf8");
    const parsed = JSON.parse(raw) as OAuthTransactionRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeFileStore(records: OAuthTransactionRecord[]): void {
  writeFileSync(fileStorePath(), JSON.stringify(records, null, 2), "utf8");
}

function prune(records: OAuthTransactionRecord[]): OAuthTransactionRecord[] {
  const now = Date.now();
  return records.filter((r) => Date.parse(r.expiresAt) > now);
}

async function savePostgres(record: OAuthTransactionRecord): Promise<void> {
  await ensurePostgresSchema();
  const { neon } = await import("@neondatabase/serverless");
  const { getConfig } = await import("@/lib/support/config");
  const url = getConfig().databaseUrl;
  if (!url) throw new Error("DATABASE_URL is not configured");
  const sql = neon(url);
  await sql`
    INSERT INTO oauth_transactions (state, cookie_name, cookie_value, expires_at)
    VALUES (${record.state}, ${record.cookieName}, ${record.cookieValue}, ${record.expiresAt})
    ON CONFLICT (state) DO UPDATE SET
      cookie_name = EXCLUDED.cookie_name,
      cookie_value = EXCLUDED.cookie_value,
      expires_at = EXCLUDED.expires_at
  `;
}

async function loadPostgres(state: string): Promise<OAuthTransactionRecord | null> {
  await ensurePostgresSchema();
  const { neon } = await import("@neondatabase/serverless");
  const { getConfig } = await import("@/lib/support/config");
  const url = getConfig().databaseUrl;
  if (!url) return null;
  const sql = neon(url);
  const rows = await sql`
    SELECT state, cookie_name, cookie_value, expires_at
    FROM oauth_transactions
    WHERE state = ${state} AND expires_at > NOW()
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    state: String(row.state),
    cookieName: String(row.cookie_name),
    cookieValue: String(row.cookie_value),
    expiresAt: new Date(String(row.expires_at)).toISOString(),
  };
}

async function deletePostgres(state: string): Promise<void> {
  if (!isPostgresConfigured()) return;
  await ensurePostgresSchema();
  const { neon } = await import("@neondatabase/serverless");
  const { getConfig } = await import("@/lib/support/config");
  const url = getConfig().databaseUrl;
  if (!url) return;
  const sql = neon(url);
  await sql`DELETE FROM oauth_transactions WHERE state = ${state}`;
}

export async function saveOAuthTransaction(input: {
  state: string;
  cookieName: string;
  cookieValue: string;
}): Promise<void> {
  const record: OAuthTransactionRecord = {
    state: input.state,
    cookieName: input.cookieName,
    cookieValue: input.cookieValue,
    expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
  };

  if (isPostgresConfigured()) {
    await savePostgres(record);
    return;
  }

  const next = prune(readFileStore()).filter((r) => r.state !== record.state);
  next.push(record);
  writeFileStore(next);
}

export async function loadOAuthTransaction(state: string): Promise<OAuthTransactionRecord | null> {
  if (isPostgresConfigured()) {
    return loadPostgres(state);
  }
  const match = prune(readFileStore()).find((r) => r.state === state);
  return match ?? null;
}

export async function deleteOAuthTransaction(state: string): Promise<void> {
  if (isPostgresConfigured()) {
    await deletePostgres(state);
    return;
  }
  writeFileStore(prune(readFileStore()).filter((r) => r.state !== state));
}
