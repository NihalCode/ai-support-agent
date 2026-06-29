import { NextResponse } from "next/server";
import { requireSupportApi, SupportApiPermission } from "@/lib/auth/support-api-auth";
import { cancelTerminalSession } from "@/lib/support/terminal/runner";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.developer, req);
  if (auth instanceof NextResponse) return auth;

  let body: { sessionId: string };
  try {
    body = (await req.json()) as { sessionId: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const session = cancelTerminalSession(body.sessionId);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  return NextResponse.json(session);
}
