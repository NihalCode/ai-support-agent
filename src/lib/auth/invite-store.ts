import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { defaultOrgId } from "@/lib/auth/config";
import { normalizeEmail } from "@/lib/auth/email-utils";
import { generateInviteToken, hashInviteToken } from "@/lib/auth/invite-tokens";
import type { UserRole } from "@/lib/auth/roles";
import { isUserRole } from "@/lib/auth/roles";
import { isPostgresConfigured, pgQuery } from "@/lib/db/postgres";

export type InviteStatus = "pending" | "accepted" | "expired" | "revoked";

export interface StoredInvite {
  id: string;
  email: string;
  role: UserRole;
  tokenHash: string;
  status: InviteStatus;
  invitedByUserId: string;
  orgId: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface InviteStoreFile {
  invites: StoredInvite[];
}

const DATA_DIR = path.join(process.cwd(), ".data");
const INVITES_FILE = path.join(DATA_DIR, "invites.json");

const DEFAULT_EXPIRY_DAYS = 7;

function defaultExpiryDays(): number {
  const raw = process.env.INVITE_DEFAULT_EXPIRY_DAYS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_EXPIRY_DAYS;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_EXPIRY_DAYS;
}

function rowToStoredInvite(row: Record<string, unknown>): StoredInvite {
  return {
    id: String(row.id),
    email: String(row.email),
    role: row.role as UserRole,
    tokenHash: String(row.token_hash ?? row.tokenHash),
    status: row.status as InviteStatus,
    invitedByUserId: String(row.invited_by_user_id ?? row.invitedByUserId),
    orgId: String(row.org_id ?? row.orgId),
    expiresAt: new Date(String(row.expires_at ?? row.expiresAt)).toISOString(),
    acceptedAt:
      row.accepted_at != null || row.acceptedAt != null
        ? new Date(String(row.accepted_at ?? row.acceptedAt)).toISOString()
        : null,
    createdAt: new Date(String(row.created_at ?? row.createdAt)).toISOString(),
    updatedAt: new Date(String(row.updated_at ?? row.updatedAt)).toISOString(),
  };
}

function isExpired(invite: StoredInvite, now = Date.now()): boolean {
  return new Date(invite.expiresAt).getTime() <= now;
}

async function readFileStore(): Promise<InviteStoreFile> {
  try {
    const raw = await readFile(INVITES_FILE, "utf8");
    const parsed = JSON.parse(raw) as InviteStoreFile;
    if (!Array.isArray(parsed.invites)) return { invites: [] };
    return parsed;
  } catch {
    return { invites: [] };
  }
}

async function writeFileStore(store: InviteStoreFile): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(INVITES_FILE, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

async function listInvitesFile(orgId: string): Promise<StoredInvite[]> {
  const store = await readFileStore();
  return store.invites.filter((i) => i.orgId === orgId);
}

async function getPendingInviteByEmailFile(
  email: string,
  orgId: string
): Promise<StoredInvite | null> {
  const normalized = normalizeEmail(email);
  const store = await readFileStore();
  const pending = store.invites.filter(
    (i) =>
      i.orgId === orgId &&
      i.status === "pending" &&
      normalizeEmail(i.email) === normalized
  );
  pending.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return pending[0] ?? null;
}

async function getInviteByTokenHashFile(tokenHash: string): Promise<StoredInvite | null> {
  const store = await readFileStore();
  return store.invites.find((i) => i.tokenHash === tokenHash) ?? null;
}

async function createInviteFile(input: {
  email: string;
  role: UserRole;
  invitedByUserId: string;
  orgId: string;
  expiresAt: Date;
}): Promise<{ invite: StoredInvite; rawToken: string }> {
  const orgId = input.orgId;
  const normalized = normalizeEmail(input.email);
  const store = await readFileStore();
  const now = new Date().toISOString();

  for (const invite of store.invites) {
    if (
      invite.orgId === orgId &&
      invite.status === "pending" &&
      normalizeEmail(invite.email) === normalized
    ) {
      invite.status = "revoked";
      invite.updatedAt = now;
    }
  }

  const { rawToken, tokenHash } = generateInviteToken();
  const invite: StoredInvite = {
    id: randomUUID(),
    email: normalized,
    role: input.role,
    tokenHash,
    status: "pending",
    invitedByUserId: input.invitedByUserId,
    orgId,
    expiresAt: input.expiresAt.toISOString(),
    acceptedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  store.invites.push(invite);
  await writeFileStore(store);
  return { invite, rawToken };
}

async function acceptInviteFile(
  inviteId: string,
  orgId: string
): Promise<StoredInvite | null> {
  const store = await readFileStore();
  const idx = store.invites.findIndex((i) => i.id === inviteId && i.orgId === orgId);
  if (idx < 0) return null;
  const now = new Date().toISOString();
  const updated: StoredInvite = {
    ...store.invites[idx]!,
    status: "accepted",
    acceptedAt: now,
    updatedAt: now,
  };
  store.invites[idx] = updated;
  await writeFileStore(store);
  return updated;
}

async function revokeInviteFile(id: string, orgId: string): Promise<StoredInvite | null> {
  const store = await readFileStore();
  const idx = store.invites.findIndex((i) => i.id === id && i.orgId === orgId);
  if (idx < 0) return null;
  const now = new Date().toISOString();
  const updated: StoredInvite = {
    ...store.invites[idx]!,
    status: "revoked",
    updatedAt: now,
  };
  store.invites[idx] = updated;
  await writeFileStore(store);
  return updated;
}

async function markExpiredInvitesFile(orgId: string): Promise<void> {
  const store = await readFileStore();
  const now = new Date().toISOString();
  let changed = false;
  for (const invite of store.invites) {
    if (
      invite.orgId === orgId &&
      invite.status === "pending" &&
      isExpired(invite)
    ) {
      invite.status = "expired";
      invite.updatedAt = now;
      changed = true;
    }
  }
  if (changed) await writeFileStore(store);
}

async function listInvitesPostgres(orgId: string): Promise<StoredInvite[]> {
  await markExpiredInvitesPostgres(orgId);
  const rows = await pgQuery`
    SELECT id, email, role, token_hash, status, invited_by_user_id, org_id,
           expires_at, accepted_at, created_at, updated_at
    FROM user_invites
    WHERE org_id = ${orgId}
    ORDER BY created_at DESC
  `;
  return rows.map(rowToStoredInvite);
}

async function getPendingInviteByEmailPostgres(
  email: string,
  orgId: string
): Promise<StoredInvite | null> {
  const normalized = normalizeEmail(email);
  const rows = await pgQuery`
    SELECT id, email, role, token_hash, status, invited_by_user_id, org_id,
           expires_at, accepted_at, created_at, updated_at
    FROM user_invites
    WHERE org_id = ${orgId}
      AND status = 'pending'
      AND LOWER(TRIM(email)) = ${normalized}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows[0] ? rowToStoredInvite(rows[0]) : null;
}

async function getInviteByTokenHashPostgres(tokenHash: string): Promise<StoredInvite | null> {
  const rows = await pgQuery`
    SELECT id, email, role, token_hash, status, invited_by_user_id, org_id,
           expires_at, accepted_at, created_at, updated_at
    FROM user_invites
    WHERE token_hash = ${tokenHash}
    LIMIT 1
  `;
  return rows[0] ? rowToStoredInvite(rows[0]) : null;
}

async function createInvitePostgres(input: {
  email: string;
  role: UserRole;
  invitedByUserId: string;
  orgId: string;
  expiresAt: Date;
}): Promise<{ invite: StoredInvite; rawToken: string }> {
  const orgId = input.orgId;
  const normalized = normalizeEmail(input.email);

  await pgQuery`
    UPDATE user_invites
    SET status = 'revoked', updated_at = NOW()
    WHERE org_id = ${orgId}
      AND status = 'pending'
      AND LOWER(TRIM(email)) = ${normalized}
  `;

  const { rawToken, tokenHash } = generateInviteToken();
  const id = randomUUID();
  const rows = await pgQuery`
    INSERT INTO user_invites (
      id, org_id, email, role, token_hash, status, invited_by_user_id, expires_at
    ) VALUES (
      ${id}, ${orgId}, ${normalized}, ${input.role}, ${tokenHash}, 'pending',
      ${input.invitedByUserId}, ${input.expiresAt.toISOString()}
    )
    RETURNING id, email, role, token_hash, status, invited_by_user_id, org_id,
              expires_at, accepted_at, created_at, updated_at
  `;
  return { invite: rowToStoredInvite(rows[0]!), rawToken };
}

async function acceptInvitePostgres(
  inviteId: string,
  orgId: string
): Promise<StoredInvite | null> {
  const rows = await pgQuery`
    UPDATE user_invites
    SET status = 'accepted', accepted_at = NOW(), updated_at = NOW()
    WHERE id = ${inviteId} AND org_id = ${orgId} AND status = 'pending'
    RETURNING id, email, role, token_hash, status, invited_by_user_id, org_id,
              expires_at, accepted_at, created_at, updated_at
  `;
  return rows[0] ? rowToStoredInvite(rows[0]) : null;
}

async function revokeInvitePostgres(id: string, orgId: string): Promise<StoredInvite | null> {
  const rows = await pgQuery`
    UPDATE user_invites
    SET status = 'revoked', updated_at = NOW()
    WHERE id = ${id} AND org_id = ${orgId} AND status = 'pending'
    RETURNING id, email, role, token_hash, status, invited_by_user_id, org_id,
              expires_at, accepted_at, created_at, updated_at
  `;
  return rows[0] ? rowToStoredInvite(rows[0]) : null;
}

async function markExpiredInvitesPostgres(orgId: string): Promise<void> {
  await pgQuery`
    UPDATE user_invites
    SET status = 'expired', updated_at = NOW()
    WHERE org_id = ${orgId}
      AND status = 'pending'
      AND expires_at <= NOW()
  `;
}

async function resendInvitePostgres(
  id: string,
  orgId: string,
  expiresAt: Date
): Promise<{ invite: StoredInvite; rawToken: string } | null> {
  const current = await pgQuery`
    SELECT id FROM user_invites
    WHERE id = ${id} AND org_id = ${orgId} AND status = 'pending'
    LIMIT 1
  `;
  if (!current[0]) return null;

  const { rawToken, tokenHash } = generateInviteToken();
  const rows = await pgQuery`
    UPDATE user_invites
    SET token_hash = ${tokenHash},
        expires_at = ${expiresAt.toISOString()},
        updated_at = NOW()
    WHERE id = ${id} AND org_id = ${orgId}
    RETURNING id, email, role, token_hash, status, invited_by_user_id, org_id,
              expires_at, accepted_at, created_at, updated_at
  `;
  return rows[0] ? { invite: rowToStoredInvite(rows[0]), rawToken } : null;
}

async function resendInviteFile(
  id: string,
  orgId: string,
  expiresAt: Date
): Promise<{ invite: StoredInvite; rawToken: string } | null> {
  const store = await readFileStore();
  const idx = store.invites.findIndex((i) => i.id === id && i.orgId === orgId);
  if (idx < 0 || store.invites[idx]!.status !== "pending") return null;
  const { rawToken, tokenHash } = generateInviteToken();
  const now = new Date().toISOString();
  store.invites[idx] = {
    ...store.invites[idx]!,
    tokenHash,
    expiresAt: expiresAt.toISOString(),
    updatedAt: now,
  };
  await writeFileStore(store);
  return { invite: store.invites[idx]!, rawToken };
}

export function inviteExpiryFromDays(days: number): Date {
  const expires = new Date();
  expires.setUTCDate(expires.getUTCDate() + days);
  return expires;
}

export function parseInviteRole(value: unknown): UserRole | null {
  return typeof value === "string" && isUserRole(value) ? value : null;
}

export async function listInvites(orgId = defaultOrgId()): Promise<StoredInvite[]> {
  return isPostgresConfigured()
    ? listInvitesPostgres(orgId)
    : listInvitesFile(orgId);
}

export async function getPendingInviteByEmail(
  email: string,
  orgId = defaultOrgId()
): Promise<StoredInvite | null> {
  return isPostgresConfigured()
    ? getPendingInviteByEmailPostgres(email, orgId)
    : getPendingInviteByEmailFile(email, orgId);
}

export async function getInviteByRawToken(rawToken: string): Promise<StoredInvite | null> {
  const tokenHash = hashInviteToken(rawToken);
  return isPostgresConfigured()
    ? getInviteByTokenHashPostgres(tokenHash)
    : getInviteByTokenHashFile(tokenHash);
}

export async function createInvite(input: {
  email: string;
  role: UserRole;
  invitedByUserId: string;
  orgId?: string;
  expiryDays?: number;
}): Promise<{ invite: StoredInvite; rawToken: string }> {
  const orgId = input.orgId ?? defaultOrgId();
  const days = input.expiryDays ?? defaultExpiryDays();
  const expiresAt = inviteExpiryFromDays(days);
  return isPostgresConfigured()
    ? createInvitePostgres({ ...input, orgId, expiresAt })
    : createInviteFile({ ...input, orgId, expiresAt });
}

export async function acceptInvite(
  inviteId: string,
  orgId = defaultOrgId()
): Promise<StoredInvite | null> {
  return isPostgresConfigured()
    ? acceptInvitePostgres(inviteId, orgId)
    : acceptInviteFile(inviteId, orgId);
}

export async function revokeInvite(
  id: string,
  orgId = defaultOrgId()
): Promise<StoredInvite | null> {
  return isPostgresConfigured()
    ? revokeInvitePostgres(id, orgId)
    : revokeInviteFile(id, orgId);
}

export async function resendInvite(
  id: string,
  orgId = defaultOrgId(),
  expiryDays?: number
): Promise<{ invite: StoredInvite; rawToken: string } | null> {
  const days = expiryDays ?? defaultExpiryDays();
  const expiresAt = inviteExpiryFromDays(days);
  return isPostgresConfigured()
    ? resendInvitePostgres(id, orgId, expiresAt)
    : resendInviteFile(id, orgId, expiresAt);
}

export function isValidPendingInvite(invite: StoredInvite, now = Date.now()): boolean {
  return invite.status === "pending" && !isExpired(invite, now);
}

export function buildInviteUrl(rawToken: string, baseUrl: string): string {
  const url = new URL("/invite", baseUrl.replace(/\/$/, ""));
  url.searchParams.set("token", rawToken);
  return url.toString();
}

export function getAppBaseUrl(): string {
  return (
    process.env.APP_BASE_URL?.trim() ||
    process.env.VERCEL_URL?.trim()?.replace(/^/, "https://") ||
    "http://localhost:3000"
  );
}
