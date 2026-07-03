import { type NextRequest, NextResponse } from "next/server";

import { requireIntegrationWrite } from "@/integrations/core/integration-api-auth";
import {
  handleConfluenceSources,
  handleConfluenceSync,
  integrationErrorResponse,
} from "@/integrations/core/integration-actions";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sessionOrResponse = await requireIntegrationWrite(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;
  return NextResponse.json(await handleConfluenceSources());
}

export async function POST(request: NextRequest) {
  const sessionOrResponse = await requireIntegrationWrite(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  let body: { spaceKey?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await handleConfluenceSync(sessionOrResponse.user.id, body.spaceKey);
    return NextResponse.json(result);
  } catch (err) {
    return integrationErrorResponse(err, 500);
  }
}
