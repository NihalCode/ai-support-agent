import { NextResponse } from "next/server";
import { requireSupportApi, SupportApiPermission } from "@/lib/auth/support-api-auth";
import {
  createNotification,
  listNotifications,
  markNotificationRead,
} from "@/lib/support/enterprise/stores/notification-store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.read, req);
  if (auth instanceof NextResponse) return auth;

  const unreadOnly = new URL(req.url).searchParams.get("unread") === "true";
  const notifications = await listNotifications(auth.user.id, unreadOnly);
  return NextResponse.json({ notifications });
}

export async function POST(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.read, req);
  if (auth instanceof NextResponse) return auth;

  let body: { intent: "mark_read"; id: string };
  try {
    body = (await req.json()) as { intent: "mark_read"; id: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.intent === "mark_read") {
    await markNotificationRead(body.id, auth.user.id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown intent" }, { status: 400 });
}

export async function PUT(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.approve, req);
  if (auth instanceof NextResponse) return auth;

  let body: { title: string; message: string; level?: "info" | "success" | "warning" | "error"; userId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const notification = await createNotification({
    userId: body.userId ?? auth.user.id,
    title: body.title,
    message: body.message,
    level: body.level,
  });
  return NextResponse.json({ notification });
}
