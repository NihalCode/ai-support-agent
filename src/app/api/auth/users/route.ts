import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/auth/session";
import {
  listUsers,
  parseRole,
  setUserStatus,
  updateUserRole,
} from "@/lib/auth/user-store";
import { USER_ROLES } from "@/lib/auth/roles";

export const runtime = "nodejs";

export async function GET() {
  const sessionOrResponse = await requirePermission("users:read");
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  const users = await listUsers(sessionOrResponse.user.orgId);
  return NextResponse.json({ users, roles: USER_ROLES });
}

export async function PATCH(request: Request) {
  const sessionOrResponse = await requirePermission("users:write");
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  let body: { userId?: string; role?: string; status?: "active" | "disabled" };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = body.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const orgId = sessionOrResponse.user.orgId;

  try {
    if (body.role !== undefined) {
      const role = parseRole(body.role);
      if (!role) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      const updated = await updateUserRole(userId, role, orgId);
      if (!updated) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      return NextResponse.json({ user: updated });
    }

    if (body.status !== undefined) {
      if (body.status !== "active" && body.status !== "disabled") {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      const updated = await setUserStatus(userId, body.status, orgId);
      if (!updated) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      return NextResponse.json({ user: updated });
    }

    return NextResponse.json({ error: "role or status required" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
