import { describe, expect, it } from "vitest";

import {
  canConfigureIntegrations,
  canManageUsers,
  canUseDeveloperMode,
  permissionsForRole,
  roleHasPermission,
} from "@/lib/auth/roles";

describe("roles", () => {
  it("owner has all permissions", () => {
    expect(roleHasPermission("owner", "users:write")).toBe(true);
    expect(roleHasPermission("owner", "integrations:write")).toBe(true);
  });

  it("viewer is read-only", () => {
    expect(roleHasPermission("viewer", "app:use")).toBe(true);
    expect(roleHasPermission("viewer", "integrations:read")).toBe(true);
    expect(roleHasPermission("viewer", "integrations:write")).toBe(false);
    expect(roleHasPermission("viewer", "developer:mode")).toBe(false);
  });

  it("developer can use developer mode but not manage users", () => {
    expect(canUseDeveloperMode("developer")).toBe(true);
    expect(canManageUsers("developer")).toBe(false);
    expect(canConfigureIntegrations("admin")).toBe(true);
  });

  it("support_agent cannot use developer mode", () => {
    expect(canUseDeveloperMode("support_agent")).toBe(false);
    expect(permissionsForRole("support_agent")).toContain("investigate:write");
  });
});
