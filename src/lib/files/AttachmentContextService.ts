import "server-only";

import { detectFileType } from "./FileTypeDetector";
import { scanUpload } from "./FileSecurityScanner";
import { parseFileContent } from "./CybersecurityFileParsers";
import {
  getAttachmentRecord,
  readAttachmentText,
  saveAttachmentRecord,
  storeAttachmentFile,
} from "./FileStorageService";
import type { AttachmentContext, UploadedAttachment } from "./types";

export async function processUploadedFile(input: {
  id: string;
  userId: string;
  conversationId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<UploadedAttachment> {
  const scan = scanUpload(input.filename, input.buffer.length, input.mimeType);
  if (!scan.ok) {
    const blocked: UploadedAttachment = {
      id: input.id,
      userId: input.userId,
      conversationId: input.conversationId,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.length,
      detectedType: scan.blocked ? "blocked" : "unknown",
      storagePath: "",
      status: scan.blocked ? "blocked" : "failed",
      warnings: [scan.reason ?? "Upload rejected"],
      createdAt: new Date().toISOString(),
    };
    saveAttachmentRecord(blocked);
    return blocked;
  }

  const storagePath = storeAttachmentFile(input.id, input.filename, input.buffer);
  const textSample = input.buffer.toString("utf8", 0, Math.min(input.buffer.length, 64_000));
  const detectedType = detectFileType(input.filename, input.mimeType, textSample);

  const processing: UploadedAttachment = {
    id: input.id,
    userId: input.userId,
    conversationId: input.conversationId,
    filename: input.filename,
    mimeType: input.mimeType,
    sizeBytes: input.buffer.length,
    detectedType,
    storagePath,
    status: "processing",
    warnings: [],
    createdAt: new Date().toISOString(),
  };
  saveAttachmentRecord(processing);

  try {
    const fullText = readAttachmentText(storagePath);
    const parsed = parseFileContent(detectedType, input.filename, fullText);
    const done: UploadedAttachment = {
      ...processing,
      status: "processed",
      summary: parsed.summary,
      extractedText: parsed.extractedText,
      parsedJson: parsed.parsedJson,
      warnings: parsed.warnings,
    };
    saveAttachmentRecord(done);
    return done;
  } catch (e) {
    const failed: UploadedAttachment = {
      ...processing,
      status: "failed",
      warnings: [e instanceof Error ? e.message : "Processing failed"],
    };
    saveAttachmentRecord(failed);
    return failed;
  }
}

export function buildAttachmentContext(attachmentId: string): AttachmentContext | null {
  const rec = getAttachmentRecord(attachmentId);
  if (!rec || rec.status === "blocked") return null;

  if (rec.status !== "processed" && rec.status !== "processing") {
    return {
      attachmentId: rec.id,
      filename: rec.filename,
      detectedType: rec.detectedType,
      summary: rec.summary ?? rec.filename,
      importantFields: { sizeBytes: rec.sizeBytes },
      warnings: rec.warnings,
      suggestedIntents: ["analyze_uploaded_file"],
    };
  }

  if (rec.storagePath) {
    try {
      const text = readAttachmentText(rec.storagePath);
      const parsed = parseFileContent(rec.detectedType, rec.filename, text);
      return {
        attachmentId: rec.id,
        filename: rec.filename,
        detectedType: rec.detectedType,
        summary: parsed.summary,
        importantFields: parsed.importantFields,
        warnings: [...rec.warnings, ...parsed.warnings],
        suggestedIntents: parsed.suggestedIntents,
      };
    } catch {
      /* fall through */
    }
  }

  return {
    attachmentId: rec.id,
    filename: rec.filename,
    detectedType: rec.detectedType,
    summary: rec.summary ?? rec.filename,
    importantFields: {},
    warnings: rec.warnings,
    suggestedIntents: ["analyze_uploaded_file"],
  };
}

export function buildAttachmentContexts(ids: string[]): AttachmentContext[] {
  return ids.map(buildAttachmentContext).filter((c): c is AttachmentContext => c !== null);
}
