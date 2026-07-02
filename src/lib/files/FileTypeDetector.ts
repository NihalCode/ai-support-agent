import type { SupportedFileType } from "./types";

export function detectFileType(filename: string, mimeType: string, textSample: string): SupportedFileType {
  const lower = filename.toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".")) : "";

  if (ext === ".pcap" || ext === ".pcapng") return "pcap";
  if (ext === ".evtx") return "evtx";
  if (ext === ".yar" || ext === ".yara") return "yara";
  if (ext === ".rules") {
    if (/alert\s+/i.test(textSample) || /sid:/i.test(textSample)) return "suricata";
    return "suricata";
  }

  if (ext === ".csv" || ext === ".txt") {
    if (/\b(ip|domain|hash|ioc|indicator)\b/i.test(textSample) && textSample.includes(",")) {
      return "ioc_csv";
    }
    if (ext === ".txt" && (/\berror\b/i.test(textSample) || /\b\d{3}\b/.test(textSample))) {
      return "log";
    }
  }

  if (ext === ".log" || ext === ".cef" || ext === ".leef") return "log";

  if (ext === ".yaml" || ext === ".yml") {
    if (/^title:\s/m.test(textSample) && /detection:/m.test(textSample)) return "sigma";
    if (/openapi:/i.test(textSample) || /swagger:/i.test(textSample)) return "openapi";
    return "yaml";
  }

  if (ext === ".json") {
    try {
      const parsed = JSON.parse(textSample.slice(0, 500_000)) as Record<string, unknown>;
      const info = parsed.info as Record<string, unknown> | undefined;
      if (parsed.type === "bundle" || parsed.objects) return "stix";
      if (info?.schema || parsed.swagger || parsed.openapi) return "openapi";
      if (info?.name && parsed.item) return "postman";
      if (parsed.name === "MITRE ATT&CK" || parsed.domain) return "json";
    } catch {
      /* fall through */
    }
    return "json";
  }

  if (ext === ".graphql" || ext === ".gql") return "yaml";
  if (ext === ".md") return "markdown";
  if (ext === ".zip") return "zip";
  if (ext === ".pdf") return "pdf";
  if (mimeType === "application/json") return "json";
  if (mimeType.includes("yaml")) return "yaml";
  if (mimeType.startsWith("text/")) return "text";
  return "unknown";
}
