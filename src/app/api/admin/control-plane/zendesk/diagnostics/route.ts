import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import { controlPlaneJson } from "@/lib/enterprise/http";
import { authorizeEnterprise } from "@/lib/enterprise/policy";
import { buildZendeskDiagnostics } from "@/lib/enterprise/zendesk-diagnostics";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const access = await guardEnterpriseApi(request, "resources.read");
  if (access instanceof NextResponse) return access;

  try {
    const includeSensitiveMetadata = authorizeEnterprise(
      access.context.principal,
      "audit.read_sensitive"
    );
    return controlPlaneJson({
      diagnostics: await buildZendeskDiagnostics(
        access.context.organization.id,
        includeSensitiveMetadata
      ),
    });
  } catch (error) {
    console.error("Zendesk diagnostics failed", error);
    return controlPlaneJson(
      {
        error: "Zendesk diagnostics are temporarily unavailable.",
        code: "diagnostics_unavailable",
      },
      { status: 503 }
    );
  }
}
