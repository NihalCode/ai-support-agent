import { NextResponse } from "next/server";
import { requireSupportApi, SupportApiPermission } from "@/lib/auth/support-api-auth";
import { listAttachmentsForConversation } from "@/lib/files/FileStorageService";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireSupportApi(SupportApiPermission.read, req);
  if (auth instanceof NextResponse) return auth;

  const { id: conversationId } = await ctx.params;
  const attachments = listAttachmentsForConversation(conversationId)
    .filter((a) => a.userId === auth.user.id)
    .map((a) => ({
      id: a.id,
      filename: a.filename,
      detectedType: a.detectedType,
      status: a.status,
      summary: a.summary,
      sizeBytes: a.sizeBytes,
    }));

  return NextResponse.json({ attachments });
}
