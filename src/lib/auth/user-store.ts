import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { defaultOrgId, isAuthEnabled } from "@/lib/auth/config";
import type { UserRole } from "@/lib/auth/roles";
import { isUserRole } from "@/lib/auth/roles";
import { getConfig } from "@/lib/support/config";

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

async function readStore(): Promise<UserStoreFile> {
  try {
    const raw = await readFile(USERS_FILE, "utf8");
    const parsed = JSON.parse(raw) as UserStoreFile;
    if (!Array.isArray(parsed.users)) return { users: [] };
    return parsed;
  } catch {
    return { users: [] };
  }
}

async function writeStore(store: UserStoreFile): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(USERS_FILE, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export async function listUsers(orgId = defaultOrgId()): Promise<StoredUser[]> {
  const store = await readStore();
  return store.users.filter((u) => u.orgId === orgId);
}

export async function getUserById(id: string): Promise<StoredUser | null> {
  const store = await readStore();
  return store.users.find((u) => u.id === id) ?? null;
}

export async function getUserByEmail(
  email: string,
  orgId = defaultOrgId()
): Promise<StoredUser | null> {
  const normalized = email.trim().toLowerCase();
  const store = await readStore();
  return (
    store.users.find(
      (u) => u.orgId === orgId && u.email.trim().toLowerCase() === normalized
    ) ?? null
  );
}

export interface UpsertUserInput {
  id: string;
  email: string;
  name?: string | null;
  role?: UserRole;
  orgId?: string;
  status?: "active" | "disabled";
}

/** First user in an org becomes owner; subsequent users default to viewer until promoted. */
export async function upsertUserFromLogin(input: UpsertUserInput): Promise<StoredUser> {
  const orgId = input.orgId ?? defaultOrgId();
  const now = new Date().toISOString();
  const store = await readStore();
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
    await writeStore(store);
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
  await writeStore(store);
  return created;
}

export async function updateUserRole(
  id: string,
  role: UserRole,
  orgId = defaultOrgId()
): Promise<StoredUser | null> {
  const store = await readStore();
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
  await writeStore(store);
  return updated;
}

export async function setUserStatus(
  id: string,
  status: "active" | "disabled",
  orgId = defaultOrgId()
): Promise<StoredUser | null> {
  const store = await readStore();
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
  await writeStore(store);
  return updated;
}

export function parseRole(value: unknown): UserRole | null {
  return typeof value === "string" && isUserRole(value) ? value : null;
}

/** Persist users to Upstash when configured (best-effort mirror). */
export async function mirrorUsersToRedis(users: StoredUser[]): Promise<void> {
  const cfg = getConfig();
  if (!cfg.upstash.restUrl || !cfg.upstash.restToken) return;
  try {
    const { Redis } = await import("@upstash/redis");
    const redis = new Redis({
      url: cfg.upstash.restUrl,
      token: cfg.upstash.restToken,
    });
    await redis.set(`users:${defaultOrgId()}`, users);
  } catch {
    // offline-first — file store is source of truth
  }
}

export function isUserStoreRequired(): boolean {
  return isAuthEnabled();
}
