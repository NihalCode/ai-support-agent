import { NextResponse } from "next/server";

import { requireIntegrationWrite } from "@/integrations/core/integration-api-auth";
import { handleSlackTestMessage } from "@/integrations/core/integration-actions";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sessionOrResponse = await requireIntegrationWrite();
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  let body: { channel?: string; text?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channel = body.channel?.trim();
  const text = body.text?.trim() ?? "AI Support Studio test message";
  if (!channel) {
    return NextResponse.json({ error: "channel required" }, { status: 400 });
  }

  const result = await handleSlackTestMessage(channel, text);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
