import "server-only";

import { processUploadedFile } from "./AttachmentContextService";
import { deleteAttachmentRecord, getAttachmentRecord } from "./FileStorageService";
import type { UploadedAttachment } from "./types";

export async function uploadFile(input: {
  userId: string;
  conversationId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<UploadedAttachment> {
  const id = crypto.randomUUID();
  return processUploadedFile({ id, ...input });
}

export function getFile(id: string): UploadedAttachment | null {
  return getAttachmentRecord(id);
}

export function deleteFile(id: string): boolean {
  return deleteAttachmentRecord(id);
}
