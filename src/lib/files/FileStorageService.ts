import "server-only";

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { supportDataRoot } from "@/lib/support/data-root";
import type { UploadedAttachment } from "./types";

const INDEX_FILE = "attachments-index.json";

function indexPath(): string {
  return path.join(supportDataRoot("uploads"), INDEX_FILE);
}

function loadIndex(): Record<string, UploadedAttachment> {
  const p = indexPath();
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8")) as Record<string, UploadedAttachment>;
  } catch {
    return {};
  }
}

function saveIndex(index: Record<string, UploadedAttachment>): void {
  writeFileSync(indexPath(), JSON.stringify(index, null, 2), "utf8");
}

export function storeAttachmentFile(id: string, filename: string, buffer: Buffer): string {
  const dir = supportDataRoot(path.join("uploads", id));
  mkdirSync(dir, { recursive: true });
  const safeName = filename.replace(/[^\w.\-()+ ]/g, "_");
  const storagePath = path.join(dir, safeName);
  writeFileSync(storagePath, buffer);
  return storagePath;
}

export function readAttachmentFile(storagePath: string): Buffer {
  return readFileSync(storagePath);
}

export function readAttachmentText(storagePath: string, maxChars = 500_000): string {
  const buf = readFileSync(storagePath);
  return buf.toString("utf8").slice(0, maxChars);
}

export function saveAttachmentRecord(record: UploadedAttachment): void {
  const index = loadIndex();
  index[record.id] = record;
  saveIndex(index);
}

export function getAttachmentRecord(id: string): UploadedAttachment | null {
  return loadIndex()[id] ?? null;
}

export function deleteAttachmentRecord(id: string): boolean {
  const index = loadIndex();
  const rec = index[id];
  if (!rec) return false;
  delete index[id];
  saveIndex(index);
  const dir = path.join(supportDataRoot("uploads"), id);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  return true;
}

export function listAttachmentsForConversation(conversationId: string): UploadedAttachment[] {
  return Object.values(loadIndex()).filter((a) => a.conversationId === conversationId);
}
