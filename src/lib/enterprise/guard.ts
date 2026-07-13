import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  getAppSessionResult,
  type AppSession,
} from "@/lib/auth/session";
import { checkStepUpAuthentication } from "@/lib/enterprise/auth-assurance";
import { resolveOrganizationContext } from "@/lib/enterprise/organization-context";
import { authorizeEnterprise } from "@/lib/enterprise/policy";
import type {
  AuthorizationResource,
  EnterprisePermission,
  OrganizationContext,
} from "@/lib/enterprise/types";

export interface EnterpriseAccess {
  session: AppSession;
  context: OrganizationContext;
}

export interface EnterpriseGuardOptions {
  resource?: AuthorizationResource;
  requireMfa?: boolean;
  maxAuthAgeSeconds?: number;
}

export type EnterpriseAccessDecision =
  | { ok: true; access: EnterpriseAccess }
  | {
      ok: false;
      status: 401 | 403;
      reason: "unauthenticated" | "forbidden" | "step_up_required";
    };

const SENSITIVE_PERMISSIONS = new Set<EnterprisePermission>([
  "resources.write_production",
  "changes.approve",
  "changes.activate",
  "changes.rollback",
  "credentials.manage",
  "security_settings.manage",
  "audit.read_sensitive",
]);

export function evaluateEnterpriseAccess(
  session: AppSession | null,
  permission: EnterprisePermission,
  options: EnterpriseGuardOptions = {}
): EnterpriseAccessDecision {
  if (!session) {
    return { ok: false, status: 401, reason: "unauthenticated" };
  }

  try {
    const context = resolveOrganizationContext(session);
    const resource = options.resource ?? {
      organizationId: context.organization.id,
    };
    if (!authorizeEnterprise(context.principal, permission, resource)) {
      return { ok: false, status: 403, reason: "forbidden" };
    }

    const sensitive =
      SENSITIVE_PERMISSIONS.has(permission) ||
      resource.sensitive === true ||
      (permission === "resources.write" &&
        resource.environment === "production");
    const assurance = checkStepUpAuthentication(session, {
      requireMfa: sensitive || options.requireMfa,
      maxAuthAgeSeconds:
        options.maxAuthAgeSeconds ?? (sensitive ? 10 * 60 : undefined),
    });
    if (!assurance.ok) {
      return { ok: false, status: 403, reason: "step_up_required" };
    }
    return { ok: true, access: { session, context } };
  } catch {
    return { ok: false, status: 403, reason: "forbidden" };
  }
}

function deniedResponse(decision: Exclude<EnterpriseAccessDecision, { ok: true }>) {
  return NextResponse.json(
    {
      error: decision.status === 401 ? "Unauthorized" : "Forbidden",
      code: decision.reason,
    },
    {
      status: decision.status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      },
    }
  );
}

export async function guardEnterpriseApi(
  request: NextRequest,
  permission: EnterprisePermission,
  options: EnterpriseGuardOptions = {}
): Promise<EnterpriseAccess | NextResponse> {
  const result = await getAppSessionResult(request);
  if (!result.session) {
    return deniedResponse(
      result.auth0Authenticated || result.accessDenied
        ? { ok: false, status: 403, reason: "forbidden" }
        : { ok: false, status: 401, reason: "unauthenticated" }
    );
  }
  const decision = evaluateEnterpriseAccess(result.session, permission, options);
  return decision.ok ? decision.access : deniedResponse(decision);
}
