import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { defaultOrgId, isAuthEnabled } from "@/lib/auth/config";
import { normalizeEmail } from "@/lib/auth/email-utils";
import type { UserRole } from "@/lib/auth/roles";
import { isUserRole } from "@/lib/auth/roles";
import { isPostgresConfigured, pgQuery } from "@/lib/db/postgres";

export interface StoredUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  orgId: string;
  status: "active" | "disabled";
  invitedByUserId?: string | null;
  acceptedInviteAt?: string | null;
  picture?: string | null;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string | null;
}

interface UserStoreFile {
  users: StoredUser[];
}

const DATA_DIR = path.join(process.cwd(), ".data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

export function userStoreBackend(): "postgres" | "file" {
  return isPostgresConfigured() ? "postgres" : "file";
}

function rowToStoredUser(row: Record<string, unknown>): StoredUser {
  return {
    id: String(row.id),
    email: String(row.email),
    name: row.name != null ? String(row.name) : null,
    role: row.role as UserRole,
    orgId: String(row.org_id ?? row.orgId),
    status: row.status as "active" | "disabled",
    invitedByUserId:
      row.invited_by_user_id != null || row.invitedByUserId != null
        ? String(row.invited_by_user_id ?? row.invitedByUserId)
        : null,
    acceptedInviteAt:
      row.accepted_invite_at != null || row.acceptedInviteAt != null
        ? new Date(String(row.accepted_invite_at ?? row.acceptedInviteAt)).toISOString()
        : null,
    picture: row.picture != null ? String(row.picture) : null,
    createdAt: new Date(String(row.created_at ?? row.createdAt)).toISOString(),
    updatedAt: new Date(String(row.updated_at ?? row.updatedAt)).toISOString(),
    lastActiveAt:
      row.last_active_at != null || row.lastActiveAt != null
        ? new Date(String(row.last_active_at ?? row.lastActiveAt)).toISOString()
        : null,
  };
}

async function readFileStore(): Promise<UserStoreFile> {
  try {
    const raw = await readFile(USERS_FILE, "utf8");
    const parsed = JSON.parse(raw) as UserStoreFile;
    if (!Array.isArray(parsed.users)) return { users: [] };
    return parsed;
  } catch {
    return { users: [] };
  }
}

async function writeFileStore(store: UserStoreFile): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(USERS_FILE, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

async function listUsersFile(orgId: string): Promise<StoredUser[]> {
  const store = await readFileStore();
  return store.users.filter((u) => u.orgId === orgId);
}

async function getUserByIdFile(id: string): Promise<StoredUser | null> {
  const store = await readFileStore();
  return store.users.find((u) => u.id === id) ?? null;
}

async function getUserByEmailFile(
  email: string,
  orgId: string
): Promise<StoredUser | null> {
  const normalized = normalizeEmail(email);
  const store = await readFileStore();
  return (
    store.users.find(
      (u) => u.orgId === orgId && normalizeEmail(u.email) === normalized
    ) ?? null
  );
}

async function upsertUserFromLoginFile(input: UpsertUserInput): Promise<StoredUser | null> {
  const now = new Date().toISOString();
  const store = await readFileStore();
  const idx = store.users.findIndex((u) => u.id === input.id);
  if (idx < 0) return null;

  const existing = store.users[idx]!;
  const updated: StoredUser = {
    ...existing,
    email: normalizeEmail(input.email),
    name: input.name ?? existing.name,
    picture: input.picture ?? existing.picture ?? null,
    lastActiveAt: now,
    updatedAt: now,
  };
  store.users[idx] = updated;
  await writeFileStore(store);
  return updated;
}

async function relinkUserAuthSubjectFile(
  input: RelinkUserAuthSubjectInput
): Promise<StoredUser | null> {
  const orgId = input.orgId ?? defaultOrgId();
  const store = await readFileStore();
  const idx = store.users.findIndex((u) => u.id === input.previousId && u.orgId === orgId);
  if (idx < 0) return null;

  const existing = store.users[idx]!;
  if (normalizeEmail(existing.email) !== normalizeEmail(input.email)) return null;

  const conflictIdx = store.users.findIndex((u) => u.id === input.auth0Sub);
  if (conflictIdx >= 0 && conflictIdx !== idx) return null;

  const now = new Date().toISOString();
  for (const user of store.users) {
    if (user.invitedByUserId === input.previousId) {
      user.invitedByUserId = input.auth0Sub;
    }
  }

  const relinked: StoredUser = {
    ...existing,
    id: input.auth0Sub,
    email: normalizeEmail(input.email),
    name: input.name ?? existing.name,
    picture: input.picture ?? existing.picture ?? null,
    lastActiveAt: now,
    updatedAt: now,
  };
  store.users[idx] = relinked;
  await writeFileStore(store);
  return relinked;
}

async function createUserFromInviteFile(input: CreateUserFromInviteInput): Promise<StoredUser> {
  const orgId = input.orgId ?? defaultOrgId();
  const now = new Date().toISOString();
  const store = await readFileStore();
  const created: StoredUser = {
    id: input.id,
    email: normalizeEmail(input.email),
    name: input.name ?? null,
    role: input.role,
    orgId,
    status: "active",
    invitedByUserId: input.invitedByUserId ?? null,
    acceptedInviteAt: now,
    picture: input.picture ?? null,
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now,
  };
  store.users.push(created);
  await writeFileStore(store);
  return created;
}

async function updateUserRoleFile(
  id: string,
  role: UserRole,
  orgId: string
): Promise<StoredUser | null> {
  const store = await readFileStore();
  const idx = store.users.findIndex((u) => u.id === id && u.orgId === orgId);
  if (idx < 0) return null;
  const owners = store.users.filter(
    (u) => u.orgId === orgId && u.role === "owner" && u.status === "active"
  );
  const current = store.users[idx]!;
  if (current.role === "owner" && role !== "owner" && owners.length <= 1) {
    throw new Error("Cannot demote the last active owner");
  }
  const updated: StoredUser = {
    ...current,
    role,
    updatedAt: new Date().toISOString(),
  };
  store.users[idx] = updated;
  await writeFileStore(store);
  return updated;
}

async function setUserStatusFile(
  id: string,
  status: "active" | "disabled",
  orgId: string
): Promise<StoredUser | null> {
  const store = await readFileStore();
  const idx = store.users.findIndex((u) => u.id === id && u.orgId === orgId);
  if (idx < 0) return null;
  const current = store.users[idx]!;
  if (current.role === "owner" && status === "disabled") {
    const owners = store.users.filter(
      (u) => u.orgId === orgId && u.role === "owner" && u.status === "active"
    );
    if (owners.length <= 1) {
      throw new Error("Cannot disable the last active owner");
    }
  }
  const updated: StoredUser = {
    ...current,
    status,
    updatedAt: new Date().toISOString(),
  };
  store.users[idx] = updated;
  await writeFileStore(store);
  return updated;
}

async function listUsersPostgres(orgId: string): Promise<StoredUser[]> {
  const rows = await pgQuery`
    SELECT id, email, name, role, org_id, status, invited_by_user_id, accepted_invite_at,
           picture, created_at, updated_at, last_active_at
    FROM app_users
    WHERE org_id = ${orgId}
    ORDER BY created_at ASC
  `;
  return rows.map(rowToStoredUser);
}

async function getUserByIdPostgres(id: string): Promise<StoredUser | null> {
  const rows = await pgQuery`
    SELECT id, email, name, role, org_id, status, invited_by_user_id, accepted_invite_at,
           picture, created_at, updated_at, last_active_at
    FROM app_users
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0] ? rowToStoredUser(rows[0]) : null;
}

async function getUserByEmailPostgres(
  email: string,
  orgId: string
): Promise<StoredUser | null> {
  const normalized = normalizeEmail(email);
  const rows = await pgQuery`
    SELECT id, email, name, role, org_id, status, invited_by_user_id, accepted_invite_at,
           picture, created_at, updated_at, last_active_at
    FROM app_users
    WHERE org_id = ${orgId} AND LOWER(TRIM(email)) = ${normalized}
    LIMIT 1
  `;
  return rows[0] ? rowToStoredUser(rows[0]) : null;
}

async function countActiveOwnersPostgres(orgId: string): Promise<number> {
  const rows = await pgQuery`
    SELECT COUNT(*)::int AS count
    FROM app_users
    WHERE org_id = ${orgId} AND role = 'owner' AND status = 'active'
  `;
  return Number(rows[0]?.count ?? 0);
}

async function upsertUserFromLoginPostgres(input: UpsertUserInput): Promise<StoredUser | null> {
  const existing = await getUserByIdPostgres(input.id);
  if (!existing) return null;

  const rows = await pgQuery`
    UPDATE app_users
    SET email = ${normalizeEmail(input.email)},
        name = ${input.name ?? existing.name},
        picture = ${input.picture ?? existing.picture ?? null},
        last_active_at = NOW(),
        updated_at = NOW()
    WHERE id = ${input.id}
    RETURNING id, email, name, role, org_id, status, invited_by_user_id, accepted_invite_at,
              picture, created_at, updated_at, last_active_at
  `;
  return rows[0] ? rowToStoredUser(rows[0]) : null;
}

async function relinkUserAuthSubjectPostgres(
  input: RelinkUserAuthSubjectInput
): Promise<StoredUser | null> {
  const orgId = input.orgId ?? defaultOrgId();
  const existing = await getUserByIdPostgres(input.previousId);
  if (!existing || existing.orgId !== orgId) return null;
  if (normalizeEmail(existing.email) !== normalizeEmail(input.email)) return null;

  const conflict = await getUserByIdPostgres(input.auth0Sub);
  if (conflict && conflict.id !== input.previousId) return null;

  const oldId = input.previousId;
  const newId = input.auth0Sub;

  await pgQuery`UPDATE app_users SET invited_by_user_id = ${newId} WHERE invited_by_user_id = ${oldId}`;
  await pgQuery`UPDATE user_invites SET invited_by_user_id = ${newId} WHERE invited_by_user_id = ${oldId}`;
  await pgQuery`UPDATE audit_logs SET actor_user_id = ${newId} WHERE actor_user_id = ${oldId}`;
  await pgQuery`
    UPDATE approval_requests SET requested_by_user_id = ${newId} WHERE requested_by_user_id = ${oldId}
  `;
  await pgQuery`
    UPDATE approval_requests SET approved_by_user_id = ${newId} WHERE approved_by_user_id = ${oldId}
  `;
  await pgQuery`UPDATE slack_conversations SET app_user_id = ${newId} WHERE app_user_id = ${oldId}`;
  await pgQuery`UPDATE app_notifications SET user_id = ${newId} WHERE user_id = ${oldId}`;
  await pgQuery`
    UPDATE investigation_links SET assigned_to_user_id = ${newId} WHERE assigned_to_user_id = ${oldId}
  `;
  await pgQuery`
    UPDATE investigation_links SET created_by_user_id = ${newId} WHERE created_by_user_id = ${oldId}
  `;
  await pgQuery`
    UPDATE knowledge_sources SET created_by_user_id = ${newId} WHERE created_by_user_id = ${oldId}
  `;
  await pgQuery`
    UPDATE integrations SET created_by_user_id = ${newId} WHERE created_by_user_id = ${oldId}
  `;
  await pgQuery`
    UPDATE integration_credentials SET updated_by = ${newId} WHERE updated_by = ${oldId}
  `;
  await pgQuery`UPDATE integration_audit_log SET actor_id = ${newId} WHERE actor_id = ${oldId}`;

  const rows = await pgQuery`
    UPDATE app_users
    SET id = ${newId},
        email = ${normalizeEmail(input.email)},
        name = ${input.name ?? existing.name},
        picture = ${input.picture ?? existing.picture ?? null},
        last_active_at = NOW(),
        updated_at = NOW()
    WHERE id = ${oldId} AND org_id = ${orgId}
    RETURNING id, email, name, role, org_id, status, invited_by_user_id, accepted_invite_at,
              picture, created_at, updated_at, last_active_at
  `;
  return rows[0] ? rowToStoredUser(rows[0]) : null;
}

async function createUserFromInvitePostgres(
  input: CreateUserFromInviteInput
): Promise<StoredUser> {
  const orgId = input.orgId ?? defaultOrgId();
  const rows = await pgQuery`
    INSERT INTO app_users (
      id, email, name, role, org_id, status, invited_by_user_id, accepted_invite_at,
      picture, last_active_at
    ) VALUES (
      ${input.id},
      ${normalizeEmail(input.email)},
      ${input.name ?? null},
      ${input.role},
      ${orgId},
      'active',
      ${input.invitedByUserId ?? null},
      NOW(),
      ${input.picture ?? null},
      NOW()
    )
    RETURNING id, email, name, role, org_id, status, invited_by_user_id, accepted_invite_at,
              picture, created_at, updated_at, last_active_at
  `;
  return rowToStoredUser(rows[0]!);
}

async function updateUserRolePostgres(
  id: string,
  role: UserRole,
  orgId: string
): Promise<StoredUser | null> {
  const current = await getUserByIdPostgres(id);
  if (!current || current.orgId !== orgId) return null;

  if (current.role === "owner" && role !== "owner") {
    const owners = await countActiveOwnersPostgres(orgId);
    if (owners <= 1) {
      throw new Error("Cannot demote the last active owner");
    }
  }

  const rows = await pgQuery`
    UPDATE app_users
    SET role = ${role}, updated_at = NOW()
    WHERE id = ${id} AND org_id = ${orgId}
    RETURNING id, email, name, role, org_id, status, invited_by_user_id, accepted_invite_at,
              picture, created_at, updated_at, last_active_at
  `;
  return rows[0] ? rowToStoredUser(rows[0]) : null;
}

async function setUserStatusPostgres(
  id: string,
  status: "active" | "disabled",
  orgId: string
): Promise<StoredUser | null> {
  const current = await getUserByIdPostgres(id);
  if (!current || current.orgId !== orgId) return null;

  if (current.role === "owner" && status === "disabled") {
    const owners = await countActiveOwnersPostgres(orgId);
    if (owners <= 1) {
      throw new Error("Cannot disable the last active owner");
    }
  }

  const rows = await pgQuery`
    UPDATE app_users
    SET status = ${status}, updated_at = NOW()
    WHERE id = ${id} AND org_id = ${orgId}
    RETURNING id, email, name, role, org_id, status, invited_by_user_id, accepted_invite_at,
              picture, created_at, updated_at, last_active_at
  `;
  return rows[0] ? rowToStoredUser(rows[0]) : null;
}

export interface UpsertUserInput {
  id: string;
  email: string;
  name?: string | null;
  picture?: string | null;
  orgId?: string;
}

export interface CreateUserFromInviteInput {
  id: string;
  email: string;
  name?: string | null;
  picture?: string | null;
  role: UserRole;
  invitedByUserId?: string | null;
  orgId?: string;
}

export interface RelinkUserAuthSubjectInput {
  previousId: string;
  auth0Sub: string;
  email: string;
  name?: string | null;
  picture?: string | null;
  orgId?: string;
}

export async function listUsers(orgId = defaultOrgId()): Promise<StoredUser[]> {
  return isPostgresConfigured()
    ? listUsersPostgres(orgId)
    : listUsersFile(orgId);
}

export async function getUserById(id: string): Promise<StoredUser | null> {
  return isPostgresConfigured()
    ? getUserByIdPostgres(id)
    : getUserByIdFile(id);
}

export async function getUserByEmail(
  email: string,
  orgId = defaultOrgId()
): Promise<StoredUser | null> {
  return isPostgresConfigured()
    ? getUserByEmailPostgres(email, orgId)
    : getUserByEmailFile(email, orgId);
}

/** Update profile fields for an existing user on login. Does not create users. */
export async function upsertUserFromLogin(input: UpsertUserInput): Promise<StoredUser | null> {
  return isPostgresConfigured()
    ? upsertUserFromLoginPostgres(input)
    : upsertUserFromLoginFile(input);
}

/** Create a new app user from an accepted invite (role assigned by invite). */
export async function createUserFromInvite(
  input: CreateUserFromInviteInput
): Promise<StoredUser> {
  return isPostgresConfigured()
    ? createUserFromInvitePostgres(input)
    : createUserFromInviteFile(input);
}

/**
 * Move an existing user record to a new Auth0 subject when the same email
 * signs in via a different connection (e.g. Google vs email/password).
 */
export async function relinkUserAuthSubject(
  input: RelinkUserAuthSubjectInput
): Promise<StoredUser | null> {
  return isPostgresConfigured()
    ? relinkUserAuthSubjectPostgres(input)
    : relinkUserAuthSubjectFile(input);
}

export async function updateUserRole(
  id: string,
  role: UserRole,
  orgId = defaultOrgId()
): Promise<StoredUser | null> {
  return isPostgresConfigured()
    ? updateUserRolePostgres(id, role, orgId)
    : updateUserRoleFile(id, role, orgId);
}

export async function setUserStatus(
  id: string,
  status: "active" | "disabled",
  orgId = defaultOrgId()
): Promise<StoredUser | null> {
  return isPostgresConfigured()
    ? setUserStatusPostgres(id, status, orgId)
    : setUserStatusFile(id, status, orgId);
}

export function parseRole(value: unknown): UserRole | null {
  return typeof value === "string" && isUserRole(value) ? value : null;
}

export function isUserStoreRequired(): boolean {
  return isAuthEnabled();
}
