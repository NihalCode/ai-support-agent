import type { UserRole } from "@/lib/auth/roles";

export type EnterpriseRole = "owner" | "admin" | "developer";
export type EnterpriseEnvironment = "development" | "staging" | "production";

export const ENTERPRISE_PERMISSIONS = [
  "admin_dashboard.access",
  "resources.read",
  "resources.write",
  "resources.write_production",
  "changes.create",
  "changes.submit",
  "changes.approve",
  "changes.activate",
  "changes.rollback",
  "credentials.read_metadata",
  "credentials.manage",
  "security_settings.manage",
  "audit.read",
  "audit.read_sensitive",
  "jobs.read",
  "jobs.manage",
] as const;

export type EnterprisePermission = (typeof ENTERPRISE_PERMISSIONS)[number];

export interface EnterprisePrincipal {
  userId: string;
  organizationId: string;
  role: UserRole | string;
  status: "active" | "disabled";
}

export interface AuthorizationResource {
  organizationId: string;
  environment?: EnterpriseEnvironment;
  sensitive?: boolean;
}

export interface OrganizationContext {
  organization: {
    id: string;
  };
  principal: EnterprisePrincipal;
}
