import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { defaultOrgId, isAuthEnabled } from "@/lib/auth/config";
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
    createdAt: new Date(String(row.created_at ?? row.createdAt)).toISOString(),
    updatedAt: new Date(String(row.updated_at ?? row.updatedAt)).toISOString(),
    lastActiveAt:
      row.last_active_at != null || row.lastActiveAt != null
        ? new Date(String(row.last_active_at ?? row.lastActiveAt)).toISOString()
        : null,
  };
}

// --- File backend (local dev / tests) ---

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
  const normalized = email.trim().toLowerCase();
  const store = await readFileStore();
  return (
    store.users.find(
      (u) => u.orgId === orgId && u.email.trim().toLowerCase() === normalized
    ) ?? null
  );
}

async function upsertUserFromLoginFile(input: UpsertUserInput): Promise<StoredUser> {
  const orgId = input.orgId ?? defaultOrgId();
  const now = new Date().toISOString();
  const store = await readFileStore();
  const idx = store.users.findIndex((u) => u.id === input.id);
  const orgUsers = store.users.filter((u) => u.orgId === orgId);

  if (idx >= 0) {
    const existing = store.users[idx]!;
    const updated: StoredUser = {
      ...existing,
      email: input.email,
      name: input.name ?? existing.name,
      lastActiveAt: now,
      updatedAt: now,
    };
    store.users[idx] = updated;
    await writeFileStore(store);
    return updated;
  }

  const role: UserRole =
    input.role ?? (orgUsers.length === 0 ? "owner" : "viewer");

  const created: StoredUser = {
    id: input.id,
    email: input.email,
    name: input.name ?? null,
    role,
    orgId,
    status: input.status ?? "active",
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

// --- Postgres backend (production) ---

async function listUsersPostgres(orgId: string): Promise<StoredUser[]> {
  const rows = await pgQuery`
    SELECT id, email, name, role, org_id, status, created_at, updated_at, last_active_at
    FROM app_users
    WHERE org_id = ${orgId}
    ORDER BY created_at ASC
  `;
  return rows.map(rowToStoredUser);
}

async function getUserByIdPostgres(id: string): Promise<StoredUser | null> {
  const rows = await pgQuery`
    SELECT id, email, name, role, org_id, status, created_at, updated_at, last_active_at
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
  const normalized = email.trim().toLowerCase();
  const rows = await pgQuery`
    SELECT id, email, name, role, org_id, status, created_at, updated_at, last_active_at
    FROM app_users
    WHERE org_id = ${orgId} AND LOWER(TRIM(email)) = ${normalized}
    LIMIT 1
  `;
  return rows[0] ? rowToStoredUser(rows[0]) : null;
}

async function countOrgUsersPostgres(orgId: string): Promise<number> {
  const rows = await pgQuery`
    SELECT COUNT(*)::int AS count FROM app_users WHERE org_id = ${orgId}
  `;
  return Number(rows[0]?.count ?? 0);
}

async function countActiveOwnersPostgres(orgId: string): Promise<number> {
  const rows = await pgQuery`
    SELECT COUNT(*)::int AS count
    FROM app_users
    WHERE org_id = ${orgId} AND role = 'owner' AND status = 'active'
  `;
  return Number(rows[0]?.count ?? 0);
}

async function upsertUserFromLoginPostgres(input: UpsertUserInput): Promise<StoredUser> {
  const orgId = input.orgId ?? defaultOrgId();
  const existing = await getUserByIdPostgres(input.id);

  if (existing) {
    const rows = await pgQuery`
      UPDATE app_users
      SET email = ${input.email},
          name = ${input.name ?? existing.name},
          last_active_at = NOW(),
          updated_at = NOW()
      WHERE id = ${input.id}
      RETURNING id, email, name, role, org_id, status, created_at, updated_at, last_active_at
    `;
    return rowToStoredUser(rows[0]!);
  }

  const orgCount = await countOrgUsersPostgres(orgId);
  const role: UserRole =
    input.role ?? (orgCount === 0 ? "owner" : "viewer");

  const rows = await pgQuery`
    INSERT INTO app_users (id, email, name, role, org_id, status, last_active_at)
    VALUES (
      ${input.id},
      ${input.email},
      ${input.name ?? null},
      ${role},
      ${orgId},
      ${input.status ?? "active"},
      NOW()
    )
    RETURNING id, email, name, role, org_id, status, created_at, updated_at, last_active_at
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
    RETURNING id, email, name, role, org_id, status, created_at, updated_at, last_active_at
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
    RETURNING id, email, name, role, org_id, status, created_at, updated_at, last_active_at
  `;
  return rows[0] ? rowToStoredUser(rows[0]) : null;
}

// --- Public API ---

export interface UpsertUserInput {
  id: string;
  email: string;
  name?: string | null;
  role?: UserRole;
  orgId?: string;
  status?: "active" | "disabled";
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

/** First user in an org becomes owner; subsequent users default to viewer until promoted. */
export async function upsertUserFromLogin(input: UpsertUserInput): Promise<StoredUser> {
  return isPostgresConfigured()
    ? upsertUserFromLoginPostgres(input)
    : upsertUserFromLoginFile(input);
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
