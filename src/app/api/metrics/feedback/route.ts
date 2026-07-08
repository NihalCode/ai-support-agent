import { type NextRequest, NextResponse } from "next/server";

import { requireSupportApi, SupportApiPermission } from "@/lib/auth/support-api-auth";
import { metrics } from "@/metrics/MetricsService";

export const runtime = "nodejs";

interface FeedbackBody {
  messageId: string;
  rating: "up" | "down";
  reason?: string;
  sessionId?: string;
  investigationId?: string;
}

export async function POST(request: NextRequest) {
  const auth = await requireSupportApi(SupportApiPermission.read, request);
  if (auth instanceof NextResponse) return auth;

  let body: FeedbackBody;
  try {
    body = (await request.json()) as FeedbackBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.messageId || (body.rating !== "up" && body.rating !== "down")) {
    return NextResponse.json({ error: "messageId and rating (up|down) required" }, { status: 400 });
  }

  await metrics.track({
    eventType: "quality.feedback",
    category: "quality",
    actorUserId: auth.user.id,
    actorRole: auth.user.role,
    success: body.rating === "up",
    metadata: {
      messageId: body.messageId,
      rating: body.rating,
      reason: body.reason?.slice(0, 200),
      sessionId: body.sessionId,
      investigationId: body.investigationId,
    },
  });

  return NextResponse.json({ ok: true });
}
