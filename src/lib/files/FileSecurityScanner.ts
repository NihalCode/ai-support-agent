import "server-only";

const MAX_BYTES = 10 * 1024 * 1024;

const BLOCKED_EXT = new Set([
  ".exe",
  ".dll",
  ".sh",
  ".bat",
  ".cmd",
  ".ps1",
  ".msi",
  ".scr",
  ".jar",
  ".com",
  ".vbs",
  ".wsf",
]);

const ALLOWED_EXT = new Set([
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".yaml",
  ".yml",
  ".xml",
  ".log",
  ".pdf",
  ".docx",
  ".xlsx",
  ".zip",
  ".graphql",
  ".gql",
  ".yar",
  ".yara",
  ".rules",
  ".evtx",
  ".pcap",
  ".pcapng",
  ".env",
]);

export interface ScanResult {
  ok: boolean;
  blocked?: boolean;
  reason?: string;
}

export function scanUpload(filename: string, sizeBytes: number, mimeType: string): ScanResult {
  if (sizeBytes <= 0) return { ok: false, reason: "Empty file" };
  if (sizeBytes > MAX_BYTES) {
    return { ok: false, reason: `File exceeds ${Math.floor(MAX_BYTES / (1024 * 1024))} MB limit` };
  }

  const ext = filename.includes(".") ? `.${filename.split(".").pop()!.toLowerCase()}` : "";
  if (BLOCKED_EXT.has(ext)) {
    return { ok: false, blocked: true, reason: "Executable files are not allowed" };
  }

  if (ext && !ALLOWED_EXT.has(ext) && !mimeType.startsWith("text/") && mimeType !== "application/json") {
    return { ok: false, reason: `File type ${ext || mimeType} is not allowed` };
  }

  return { ok: true };
}

export { MAX_BYTES as FILE_UPLOAD_MAX_BYTES };
