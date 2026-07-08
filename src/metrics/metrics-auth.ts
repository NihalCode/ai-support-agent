import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { AppSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/session";
import type { UserRole } from "@/lib/auth/roles";
import { roleHasPermission } from "@/lib/auth/roles";
import { getMetricsSettings } from "./stores/metrics-store";

export type MetricsAccessLevel = "none" | "read" | "admin";

export async function resolveMetricsAccess(
  request?: NextRequest
): Promise<{ session: AppSession; level: MetricsAccessLevel } | NextResponse> {
  const settings = await getMetricsSettings();

  const adminSession = await requirePermission("metrics:write", request);
  if (!(adminSession instanceof NextResponse)) {
    return { session: adminSession, level: "admin" };
  }

  const readSession = await requirePermission("metrics:read", request);
  if (readSession instanceof NextResponse) {
    return readSession;
  }

  const role = readSession.user.role as UserRole;
  if (role === "support_agent" && !settings.allowSupportAgentView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (role === "developer" && !settings.allowDeveloperView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return { session: readSession, level: "read" };
}

export function canAccessMetrics(role: UserRole): boolean {
  if (roleHasPermission(role, "metrics:write")) return true;
  if (roleHasPermission(role, "metrics:read") && role !== "viewer") return true;
  return false;
}

export function canManageMetricsSettings(role: UserRole): boolean {
  return roleHasPermission(role, "metrics:write");
}
