import { NextResponse } from "next/server";

import { requireIntegrationWrite } from "@/integrations/core/integration-api-auth";
import {
  handleConfluenceSources,
  handleConfluenceSync,
  integrationErrorResponse,
} from "@/integrations/core/integration-actions";

export const runtime = "nodejs";

export async function GET() {
  const sessionOrResponse = await requireIntegrationWrite();
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;
  return NextResponse.json(await handleConfluenceSources());
}

export async function POST(req: Request) {
  const sessionOrResponse = await requireIntegrationWrite();
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  let body: { spaceKey?: string };
  try {
    body = (await req.json()) as typeof body;
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
