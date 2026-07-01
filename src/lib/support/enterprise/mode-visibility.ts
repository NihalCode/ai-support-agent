/** UI visibility helpers for Support vs Developer/Admin mode. Server RBAC remains authoritative. */

export type ProductMode = "client" | "developer";

export function isSupportMode(mode: ProductMode): boolean {
  return mode === "client";
}

export function showDeveloperTools(mode: ProductMode, canUseDeveloperMode: boolean): boolean {
  return mode === "developer" && canUseDeveloperMode;
}

export function showAdminSettings(mode: ProductMode, canAudit: boolean): boolean {
  return canAudit;
}

export function supportModeLabel(mode: ProductMode): string {
  return mode === "client" ? "Support Mode" : "Developer / Admin Mode";
}
