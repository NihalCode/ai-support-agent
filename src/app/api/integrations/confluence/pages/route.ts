import { NextResponse } from "next/server";

import { requireIntegrationRead } from "@/integrations/core/integration-api-auth";
import {
  handleConfluenceRead,
  handleConfluenceSearch,
  integrationErrorResponse,
} from "@/integrations/core/integration-actions";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const sessionOrResponse = await requireIntegrationRead();
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  const url = new URL(req.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const limit = Number(url.searchParams.get("limit") ?? "10");
  if (!query) {
    return NextResponse.json({ error: "q required" }, { status: 400 });
  }

  try {
    return NextResponse.json(await handleConfluenceSearch(query, limit));
  } catch (err) {
    return integrationErrorResponse(err, 502);
  }
}

export async function POST(req: Request) {
  const sessionOrResponse = await requireIntegrationRead();
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  let body: { pageId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.pageId?.trim()) {
    return NextResponse.json({ error: "pageId required" }, { status: 400 });
  }

  try {
    return NextResponse.json(await handleConfluenceRead(body.pageId.trim()));
  } catch (err) {
    return integrationErrorResponse(err, 502);
  }
}
