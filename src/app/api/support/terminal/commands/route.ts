import { NextResponse } from "next/server";
import { listTerminalCommands } from "@/lib/support/terminal/runner";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ commands: listTerminalCommands() });
}
