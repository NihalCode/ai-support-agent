import { NextResponse } from "next/server";

import { requireIntegrationRead } from "@/integrations/core/integration-api-auth";
import {
  handleJiraRead,
  handleJiraSearch,
  integrationErrorResponse,
} from "@/integrations/core/integration-actions";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const sessionOrResponse = await requireIntegrationRead();
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  const url = new URL(req.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const issueKey = url.searchParams.get("issueKey")?.trim();
  const limit = Number(url.searchParams.get("limit") ?? "10");

  try {
    if (issueKey) {
      return NextResponse.json(await handleJiraRead(issueKey));
    }
    if (!query) {
      return NextResponse.json({ error: "q or issueKey required" }, { status: 400 });
    }
    return NextResponse.json(await handleJiraSearch(query, limit));
  } catch (err) {
    return integrationErrorResponse(err, 502);
  }
}
