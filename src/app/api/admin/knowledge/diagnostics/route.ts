import { NextRequest, NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { roleHasPermission } from "@/lib/auth/roles";
import { getKnowledgeDiagnostics } from "@/knowledge/diagnostics/KnowledgeDiagnosticsService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin knowledge pipeline diagnostics (no secrets). */
export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  if (
    !roleHasPermission(session.user.role, "users:read") &&
    !roleHasPermission(session.user.role, "users:write")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const diagnostics = await getKnowledgeDiagnostics();
  return NextResponse.json({ ok: true, diagnostics });
}
