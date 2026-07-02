export type SupportedFileType =
  | "openapi"
  | "postman"
  | "stix"
  | "sigma"
  | "yara"
  | "suricata"
  | "ioc_csv"
  | "log"
  | "json"
  | "yaml"
  | "markdown"
  | "text"
  | "pdf"
  | "zip"
  | "pcap"
  | "evtx"
  | "unknown"
  | "blocked";

export type UploadedAttachmentStatus =
  | "uploaded"
  | "processing"
  | "processed"
  | "failed"
  | "blocked";

export interface UploadedAttachment {
  id: string;
  userId: string;
  conversationId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  detectedType: SupportedFileType;
  storagePath: string;
  status: UploadedAttachmentStatus;
  summary?: string;
  extractedText?: string;
  parsedJson?: unknown;
  warnings: string[];
  createdAt: string;
}

export interface AttachmentContext {
  attachmentId: string;
  filename: string;
  detectedType: SupportedFileType;
  summary: string;
  importantFields: Record<string, unknown>;
  warnings: string[];
  suggestedIntents: string[];
}

export interface AttachmentRef {
  id: string;
  filename: string;
  detectedType: SupportedFileType;
  summary?: string;
  sizeBytes: number;
  status: UploadedAttachmentStatus;
}
