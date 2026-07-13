import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  CSRF_COOKIE_NAME,
  createCsrfToken,
  csrfCookieOptions,
} from "@/lib/enterprise/csrf";
import { hasPrivilegedMfa } from "@/lib/enterprise/auth-assurance";
import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import { controlPlaneJson } from "@/lib/enterprise/http";
import {
  enterpriseRequestIds,
  logEnterpriseEvent,
} from "@/lib/enterprise/observability";
import { enterpriseCapabilities } from "@/lib/enterprise/policy";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const access = await guardEnterpriseApi(request, "admin_dashboard.access");
  if (access instanceof NextResponse) return access;

  const ids = enterpriseRequestIds(request.headers);
  const csrfToken = createCsrfToken();
  const response = controlPlaneJson(
    {
      organization: { id: access.context.organization.id },
      actor: { id: access.session.user.id },
      role: access.context.principal.role,
      capabilities: enterpriseCapabilities(access.context.principal),
      assurance: {
        mfaVerified: hasPrivilegedMfa(access.session),
        authTimeAvailable:
          typeof access.session.assurance?.authTime === "number",
      },
      csrfToken,
    },
    {
      headers: {
        "X-Correlation-ID": ids.correlationId,
        "X-Request-ID": ids.requestId,
        "X-Trace-ID": ids.traceId,
      },
    }
  );
  response.cookies.set(CSRF_COOKIE_NAME, csrfToken, csrfCookieOptions());
  logEnterpriseEvent({
    event: "admin.context_read",
    outcome: "success",
    ids,
    organizationId: access.context.organization.id,
    actorUserId: access.session.user.id,
  });
  return response;
}
