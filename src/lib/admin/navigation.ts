import type { EnterprisePermission } from "@/lib/enterprise/types";

export const ADMIN_DASHBOARD_PERMISSION = "admin_dashboard.access" as const;

export function canAccessAdminDashboard(
  capabilities: readonly EnterprisePermission[] | readonly string[]
): boolean {
  return capabilities.includes(ADMIN_DASHBOARD_PERMISSION);
}

export interface AdminNavItem {
  href: string;
  label: string;
  /** Required capability; omit when visible to all dashboard users. */
  permission?: EnterprisePermission;
  /** Mark routes that use placeholder data until backend is wired. */
  placeholder?: boolean;
}

export interface AdminNavGroup {
  id: string;
  label: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    items: [{ href: "/admin", label: "Dashboard" }],
  },
  {
    id: "documentation-agent",
    label: "Documentation Agent",
    items: [
      { href: "/admin/documentation-agent", label: "Overview", placeholder: true },
      { href: "/admin/documentation-agent/apis", label: "APIs", placeholder: true },
      {
        href: "/admin/documentation-agent/integrations",
        label: "Integrations",
        placeholder: true,
      },
      {
        href: "/admin/documentation-agent/keys",
        label: "API keys",
        permission: "credentials.read_metadata",
        placeholder: true,
      },
    ],
  },
  {
    id: "support-agent",
    label: "Support Agent",
    items: [
      { href: "/admin/support-agent", label: "Overview" },
      { href: "/admin/support-agent/apis", label: "APIs", permission: "resources.read" },
      {
        href: "/admin/support-agent/integrations",
        label: "Integrations",
        permission: "resources.read",
      },
      {
        href: "/admin/support-agent/keys",
        label: "API keys",
        permission: "credentials.read_metadata",
      },
    ],
  },
  {
    id: "shared-config",
    label: "Shared config",
    items: [
      { href: "/admin/environments", label: "Environments", permission: "resources.read" },
      { href: "/admin/rate-limits", label: "Rate limits", permission: "resources.read" },
      {
        href: "/admin/change-requests",
        label: "Change requests",
        permission: "changes.create",
      },
      { href: "/admin/audit-logs", label: "Audit logs", permission: "audit.read" },
    ],
  },
  {
    id: "security",
    label: "Security",
    items: [
      {
        href: "/admin/security/roles",
        label: "Roles",
        permission: "security_settings.manage",
        placeholder: true,
      },
      {
        href: "/admin/security/service-accounts",
        label: "Service accounts",
        permission: "credentials.read_metadata",
        placeholder: true,
      },
      {
        href: "/admin/security/settings",
        label: "Settings",
        permission: "security_settings.manage",
        placeholder: true,
      },
    ],
  },
];

export function filterNavGroups(
  capabilities: readonly string[]
): AdminNavGroup[] {
  const caps = new Set(capabilities);
  return ADMIN_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !item.permission || caps.has(item.permission)
    ),
  })).filter((group) => group.items.length > 0);
}
