import { NextResponse } from "next/server";
import { getTerminalSession, sessionOutputText } from "@/lib/support/terminal/runner";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = getTerminalSession(id);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ...session, outputText: sessionOutputText(session) });
}
