import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { AppSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/session";
import {
  canConfigureIntegrations,
  canConfigureJira,
  canDisconnectJira,
  canUseDeveloperMode,
  type Permission,
} from "@/lib/auth/roles";
import type { IntegrationId } from "@/integrations/core/IntegrationTypes";

export async function requireIntegrationRead(
  request?: NextRequest
): Promise<AppSession | NextResponse> {
  return requirePermission("integrations:read", request);
}

export async function requireIntegrationWrite(
  request?: NextRequest
): Promise<AppSession | NextResponse> {
  return requirePermission("integrations:write", request);
}

export async function requireInvestigateRead(
  request?: NextRequest
): Promise<AppSession | NextResponse> {
  return requirePermission("investigate:write" as Permission, request);
}

export function assertConfigureIntegration(
  session: AppSession,
  type: IntegrationId
): NextResponse | null {
  if (type === "jira") {
    if (!canConfigureJira(session.user.role)) {
      return NextResponse.json(
        { error: "Custom Jira configuration requires Developer/Admin Mode." },
        { status: 403 }
      );
    }
    return null;
  }
  if (!canConfigureIntegrations(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export function assertDisconnectIntegration(
  session: AppSession,
  type: IntegrationId
): NextResponse | null {
  if (type === "jira" && !canDisconnectJira(session.user.role)) {
    return NextResponse.json(
      { error: "Disconnecting Jira requires Owner or Admin role." },
      { status: 403 }
    );
  }
  if (type !== "jira" && !canConfigureIntegrations(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export function developerModeFromSession(session: AppSession): boolean {
  return canUseDeveloperMode(session.user.role);
}
