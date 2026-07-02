import { NextResponse } from "next/server";
import { requireSupportApi, SupportApiPermission } from "@/lib/auth/support-api-auth";
import { deleteFile, getFile } from "@/lib/files/FileUploadService";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireSupportApi(SupportApiPermission.read, req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const record = getFile(id);
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (record.userId !== auth.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
      createdAt: record.createdAt,
    },
  });
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireSupportApi(SupportApiPermission.read, req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const record = getFile(id);
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (record.userId !== auth.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  deleteFile(id);
  return NextResponse.json({ ok: true });
}
