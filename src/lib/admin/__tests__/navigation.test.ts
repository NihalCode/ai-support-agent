import { describe, expect, it } from "vitest";

import { filterNavGroups, ADMIN_NAV_GROUPS } from "@/lib/admin/navigation";

describe("admin navigation", () => {
  it("shows all groups for owner capabilities", () => {
    const groups = filterNavGroups([
      "admin_dashboard.access",
      "resources.read",
      "changes.create",
      "credentials.read_metadata",
      "audit.read",
      "security_settings.manage",
    ]);
    expect(groups.length).toBe(ADMIN_NAV_GROUPS.length);
    expect(groups.some((group) => group.id === "security")).toBe(true);
  });

  it("limits security nav for developers to credential-scoped items", () => {
    const groups = filterNavGroups([
      "admin_dashboard.access",
      "resources.read",
      "changes.create",
      "credentials.read_metadata",
      "audit.read",
    ]);
    const security = groups.find((group) => group.id === "security");
    expect(security?.items.map((item) => item.href)).toEqual([
      "/admin/security/service-accounts",
    ]);
    expect(groups.some((group) => group.id === "support-agent")).toBe(true);
  });

  it("always includes overview for dashboard access", () => {
    const groups = filterNavGroups(["admin_dashboard.access"]);
    expect(groups[0]?.id).toBe("overview");
    expect(groups[0]?.items[0]?.href).toBe("/admin");
  });
});
