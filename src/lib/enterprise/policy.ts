import {
  ENTERPRISE_PERMISSIONS,
  type AuthorizationResource,
  type EnterprisePermission,
  type EnterprisePrincipal,
  type EnterpriseRole,
} from "@/lib/enterprise/types";

const ROLE_PERMISSIONS: Record<EnterpriseRole, readonly EnterprisePermission[]> = {
  owner: ENTERPRISE_PERMISSIONS,
  admin: ENTERPRISE_PERMISSIONS,
  developer: [
    "admin_dashboard.access",
    "resources.read",
    "resources.write",
    "changes.create",
    "changes.submit",
    "credentials.read_metadata",
    "audit.read",
    "jobs.read",
  ],
};

const ENTERPRISE_ROLES = new Set<EnterpriseRole>(["owner", "admin", "developer"]);

export function mapEnterpriseRole(role: string): EnterpriseRole | null {
  return ENTERPRISE_ROLES.has(role as EnterpriseRole)
    ? (role as EnterpriseRole)
    : null;
}

export function enterprisePermissionsForRole(role: string): readonly EnterprisePermission[] {
  const mapped = mapEnterpriseRole(role);
  return mapped ? ROLE_PERMISSIONS[mapped] : [];
}

export function authorizeEnterprise(
  principal: EnterprisePrincipal,
  permission: EnterprisePermission | string,
  resource?: AuthorizationResource
): boolean {
  if (principal.status !== "active") return false;
  if (resource && resource.organizationId !== principal.organizationId) return false;
  if (!(ENTERPRISE_PERMISSIONS as readonly string[]).includes(permission)) return false;

  const role = mapEnterpriseRole(principal.role);
  if (!role) return false;
  if (!ROLE_PERMISSIONS[role].includes(permission as EnterprisePermission)) return false;

  if (
    role === "developer" &&
    resource?.environment === "production" &&
    permission !== "resources.read"
  ) {
    return false;
  }
  return true;
}

export function enterpriseCapabilities(
  principal: EnterprisePrincipal
): EnterprisePermission[] {
  return ENTERPRISE_PERMISSIONS.filter((permission) =>
    authorizeEnterprise(principal, permission, {
      organizationId: principal.organizationId,
    })
  );
}
