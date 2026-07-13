import "server-only";

import type { AppSession } from "@/lib/auth/session";
import { mapEnterpriseRole } from "@/lib/enterprise/policy";
import type { OrganizationContext } from "@/lib/enterprise/types";

export class OrganizationContextError extends Error {
  constructor() {
    super("Access denied");
    this.name = "OrganizationContextError";
  }
}

/**
 * Derives tenant identity only from the app_users-backed server session.
 * Request headers, query parameters, and request bodies are deliberately absent.
 */
export function resolveOrganizationContext(session: AppSession): OrganizationContext {
  const organizationId = session.user.orgId.trim();
  if (
    session.user.status !== "active" ||
    !organizationId ||
    !mapEnterpriseRole(session.user.role)
  ) {
    throw new OrganizationContextError();
  }

  return {
    organization: { id: organizationId },
    principal: {
      userId: session.user.id,
      organizationId,
      role: session.user.role,
      status: session.user.status,
    },
  };
}
