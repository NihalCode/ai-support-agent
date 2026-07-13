import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import {
  ApiInputError,
  controlPlaneJson,
  exactKeys,
  readStrictJson,
  requireEnterpriseMutationRateLimit,
  requireMutationCsrf,
} from "@/lib/enterprise/http";
import { enterpriseRequestIds } from "@/lib/enterprise/observability";
import { runSanitizedZendeskTestSearch } from "@/lib/enterprise/zendesk-diagnostics";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const access = await guardEnterpriseApi(request, "resources.read");
  if (access instanceof NextResponse) return access;
  const csrf = requireMutationCsrf(request);
  if (csrf) return csrf;
  const limited = requireEnterpriseMutationRateLimit(access);
  if (limited) return limited;
  const ids = enterpriseRequestIds(request.headers);

  try {
    const body = await readStrictJson(request, 4 * 1024);
    exactKeys(body, ["query"]);
    if (
      typeof body.query !== "string" ||
      body.query.trim().length < 2 ||
      body.query.trim().length > 200
    ) {
      throw new ApiInputError("Query must be between 2 and 200 characters.");
    }
    return controlPlaneJson(
      {
        result: await runSanitizedZendeskTestSearch(
          access.context.organization.id,
          body.query.trim(),
          ids.traceId
        ),
      },
      { headers: { "X-Trace-ID": ids.traceId } }
    );
  } catch (error) {
    if (error instanceof ApiInputError) {
      return controlPlaneJson({ error: error.message }, { status: error.status });
    }
    console.error("Zendesk test search failed", error);
    return controlPlaneJson(
      {
        error: "Zendesk test search is temporarily unavailable.",
        code: "search_unavailable",
        traceId: ids.traceId,
      },
      { status: 503 }
    );
  }
}
