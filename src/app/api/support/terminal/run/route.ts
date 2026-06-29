import { NextResponse } from "next/server";
import { requireSupportApi, SupportApiPermission } from "@/lib/auth/support-api-auth";
import { runTerminalCommand } from "@/lib/support/terminal/runner";
import { audit } from "@/lib/support/audit";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.developer, req);
  if (auth instanceof NextResponse) return auth;

  let body: { command: string; approved?: boolean };
  try {
    body = (await req.json()) as { command: string; approved?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.command?.trim()) {
    return NextResponse.json({ error: "command required" }, { status: 400 });
  }

  try {
    const session = await runTerminalCommand(body.command, { approved: body.approved });
    await audit({
      action: "terminal:run",
      target: body.command,
      approved: true,
      details: `exit=${session.exitCode ?? "pending"}`,
    });
    return NextResponse.json(session);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Command failed" },
      { status: 403 }
    );
  }
}
