import { NextResponse } from "next/server";
import { requireSupportApi, SupportApiPermission } from "@/lib/auth/support-api-auth";
import { uploadFile } from "@/lib/files/FileUploadService";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.read, req);
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const file = form.get("file");
  const conversationId = String(form.get("conversationId") ?? "default");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const record = await uploadFile({
    userId: auth.user.id,
    conversationId,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    buffer,
  });

  return NextResponse.json({
    attachment: {
      id: record.id,
      filename: record.filename,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      detectedType: record.detectedType,
      status: record.status,
      summary: record.summary,
      warnings: record.warnings,
    },
  });
}
