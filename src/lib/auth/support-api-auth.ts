import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { Permission } from "@/lib/auth/roles";
import { requirePermission, type AppSession } from "@/lib/auth/session";

/** RBAC gate for `/api/support/*` route handlers. */
export async function requireSupportApi(
  permission: Permission,
  request?: Request | NextRequest
): Promise<AppSession | NextResponse> {
  const req = request as NextRequest | undefined;
  return requirePermission(permission, req);
}

export const SupportApiPermission = {
  read: "app:use",
  investigate: "investigate:write",
  approve: "approvals:write",
  build: "build:write",
  audit: "audit:read",
  developer: "developer:mode",
} as const satisfies Record<string, Permission>;
