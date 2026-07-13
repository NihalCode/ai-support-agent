import { type NextRequest, NextResponse } from "next/server";

import { requireIntegrationWrite } from "@/integrations/core/integration-api-auth";
import {
  handleZendeskSources,
  handleZendeskSync,
  integrationErrorResponse,
} from "@/integrations/core/integration-actions";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sessionOrResponse = await requireIntegrationWrite(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;
  return NextResponse.json(await handleZendeskSources());
}

export async function POST(request: NextRequest) {
  const sessionOrResponse = await requireIntegrationWrite(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  try {
    const result = await handleZendeskSync(sessionOrResponse.user.id);
    return NextResponse.json(result);
  } catch (err) {
    return integrationErrorResponse(err, 500);
  }
}
