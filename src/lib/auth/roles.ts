/** App-level RBAC — Auth0 is identity only; roles live in our user store. */

export const USER_ROLES = [
  "owner",
  "admin",
  "developer",
  "support_agent",
  "viewer",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const PERMISSIONS = [
  "app:use",
  "integrations:read",
  "integrations:write",
  "users:read",
  "users:write",
  "approvals:write",
  "audit:read",
  "metrics:read",
  "metrics:write",
  "developer:mode",
  "build:write",
  "investigate:write",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: [
    "app:use",
    "integrations:read",
    "integrations:write",
    "users:read",
    "users:write",
    "approvals:write",
    "audit:read",
    "metrics:read",
    "metrics:write",
    "developer:mode",
    "build:write",
    "investigate:write",
  ],
  developer: [
    "app:use",
    "integrations:read",
    "approvals:write",
    "metrics:read",
    "developer:mode",
    "build:write",
    "investigate:write",
  ],
  support_agent: [
    "app:use",
    "integrations:read",
    "approvals:write",
    "investigate:write",
  ],
  viewer: ["app:use", "integrations:read"],
};

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

export function permissionsForRole(role: UserRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return permissionsForRole(role).includes(permission);
}

export function canManageUsers(role: UserRole): boolean {
  return roleHasPermission(role, "users:write");
}

export function canConfigureIntegrations(role: UserRole): boolean {
  return roleHasPermission(role, "integrations:write");
}

export function canUseDeveloperMode(role: UserRole): boolean {
  return roleHasPermission(role, "developer:mode");
}

export function canConfigureJira(role: UserRole): boolean {
  if (!canUseDeveloperMode(role)) return false;
  return role === "owner" || role === "admin" || role === "developer";
}

export function canDisconnectJira(role: UserRole): boolean {
  return role === "owner" || role === "admin";
}

export function canManageIntegrations(user: { role: UserRole }): boolean {
  return canConfigureIntegrations(user.role);
}
