import "server-only";

import { parse as parseYaml } from "yaml";
import type { AttachmentContext, SupportedFileType } from "./types";

export interface ParseResult {
  summary: string;
  importantFields: Record<string, unknown>;
  warnings: string[];
  suggestedIntents: string[];
  extractedText?: string;
  parsedJson?: unknown;
}

export function parseFileContent(
  detectedType: SupportedFileType,
  filename: string,
  content: string
): ParseResult {
  switch (detectedType) {
    case "openapi":
      return parseOpenApi(content);
    case "postman":
      return parsePostman(content);
    case "stix":
      return parseStix(content, filename);
    case "sigma":
      return parseSigma(content);
    case "yara":
      return parseYara(content, filename);
    case "suricata":
      return parseSuricata(content);
    case "ioc_csv":
      return parseIocCsv(content, filename);
    case "log":
      return parseLog(content, filename);
    case "pcap":
      return unsupportedParser("PCAP", filename, ["analyze_cyber_artifact"]);
    case "evtx":
      return unsupportedParser("Windows EVTX", filename, ["analyze_cyber_artifact"]);
    default:
      return {
        summary: `Stored ${filename} (${detectedType}) for context.`,
        importantFields: { charCount: content.length },
        warnings: [],
        suggestedIntents: ["analyze_uploaded_file"],
        extractedText: content.slice(0, 8000),
      };
  }
}

function unsupportedParser(label: string, filename: string, intents: string[]): ParseResult {
  return {
    summary: `${filename} · ${label} · parser not enabled · metadata only`,
    importantFields: { filename },
    warnings: [
      `Deep parsing for ${label} is not enabled yet. Upload extracted logs or IOCs for deeper analysis.`,
    ],
    suggestedIntents: intents,
  };
}

function parseOpenApi(content: string): ParseResult {
  let doc: Record<string, unknown>;
  try {
    doc = content.trim().startsWith("{")
      ? (JSON.parse(content) as Record<string, unknown>)
      : (parseYaml(content) as Record<string, unknown>);
  } catch {
    return {
      summary: "Could not parse OpenAPI document.",
      importantFields: {},
      warnings: ["Invalid OpenAPI format"],
      suggestedIntents: ["analyze_uploaded_file"],
    };
  }

  const paths = (doc.paths ?? {}) as Record<string, unknown>;
  const endpointCount = Object.entries(paths).reduce((n, [, methods]) => {
    if (!methods || typeof methods !== "object") return n;
    return n + Object.keys(methods as object).filter((k) => !k.startsWith("x-")).length;
  }, 0);

  const title = String((doc.info as { title?: string })?.title ?? "API spec");
  return {
    summary: `OpenAPI spec "${title}" with ${endpointCount} endpoint(s).`,
    importantFields: { title, endpointCount },
    warnings: endpointCount === 0 ? ["No endpoints found in spec"] : [],
    suggestedIntents: ["analyze_uploaded_file", "generate_api_request"],
    parsedJson: { title, endpointCount },
    extractedText: content.slice(0, 12000),
  };
}

function parsePostman(content: string): ParseResult {
  try {
    const doc = JSON.parse(content) as { info?: { name?: string }; item?: unknown[] };
    const count = doc.item?.length ?? 0;
    const name = doc.info?.name ?? "Postman collection";
    return {
      summary: `Postman collection "${name}" with ${count} item(s).`,
      importantFields: { name, itemCount: count },
      warnings: [],
      suggestedIntents: ["analyze_uploaded_file", "generate_api_request"],
      parsedJson: { name, itemCount: count },
    };
  } catch {
    return {
      summary: "Could not parse Postman collection JSON.",
      importantFields: {},
      warnings: ["Invalid Postman JSON"],
      suggestedIntents: ["analyze_uploaded_file"],
    };
  }
}

function parseStix(content: string, filename: string): ParseResult {
  try {
    const doc = JSON.parse(content) as { objects?: Array<{ type?: string }> };
    const objects = doc.objects ?? [];
    const byType: Record<string, number> = {};
    for (const o of objects) {
      const t = o.type ?? "unknown";
      byType[t] = (byType[t] ?? 0) + 1;
    }
    const indicators = byType.indicator ?? 0;
    const relationships = byType.relationship ?? 0;
    const malware = byType.malware ?? 0;
    return {
      summary: `STIX bundle ${filename}: ${objects.length} object(s) — ${indicators} indicator(s), ${malware} malware, ${relationships} relationship(s).`,
      importantFields: { objectCount: objects.length, indicators, malware, relationships, byType },
      warnings: objects.length === 0 ? ["No STIX objects found"] : [],
      suggestedIntents: ["analyze_cyber_artifact", "investigate_support_issue"],
      parsedJson: { objectCount: objects.length, byType },
      extractedText: content.slice(0, 12000),
    };
  } catch {
    return {
      summary: "Could not parse STIX JSON.",
      importantFields: {},
      warnings: ["Invalid STIX JSON"],
      suggestedIntents: ["analyze_uploaded_file"],
    };
  }
}

function parseSigma(content: string): ParseResult {
  const rules = content.split(/^---\s*$/m).filter((b) => /title:/i.test(b));
  const count = rules.length || (content.includes("title:") ? 1 : 0);
  const mitre = [...content.matchAll(/attack\.(t\d+)/gi)].map((m) => m[0]);
  return {
    summary: `Detected ${count} Sigma rule(s)${mitre.length ? ` with MITRE refs: ${[...new Set(mitre)].join(", ")}` : ""}.`,
    importantFields: { ruleCount: count, mitreIds: [...new Set(mitre)] },
    warnings: mitre.length === 0 ? ["No MITRE ATT&CK IDs found in rule text"] : [],
    suggestedIntents: ["analyze_cyber_artifact", "investigate_support_issue"],
    extractedText: content.slice(0, 12000),
  };
}

function parseYara(content: string, filename: string): ParseResult {
  const rules = content.match(/rule\s+\w+/g) ?? [];
  return {
    summary: `YARA file ${filename}: ${rules.length || 1} rule(s) detected.`,
    importantFields: { ruleCount: rules.length || 1 },
    warnings: [],
    suggestedIntents: ["analyze_cyber_artifact"],
    extractedText: content.slice(0, 12000),
  };
}

function parseSuricata(content: string): ParseResult {
  const alerts = content.match(/^alert\s+/gm) ?? [];
  return {
    summary: `Suricata/Snort rules file: ${alerts.length || "multiple"} rule(s).`,
    importantFields: { alertRules: alerts.length },
    warnings: [],
    suggestedIntents: ["analyze_cyber_artifact"],
    extractedText: content.slice(0, 12000),
  };
}

function parseIocCsv(content: string, filename: string): ParseResult {
  const lines = content.trim().split(/\r?\n/).filter(Boolean);
  const header = lines[0]?.split(",").map((c) => c.trim()) ?? [];
  const rows = Math.max(0, lines.length - 1);
  return {
    summary: `IOC list ${filename}: ${rows} row(s), columns: ${header.join(", ") || "unknown"}.`,
    importantFields: { rows, columns: header },
    warnings: header.length === 0 ? ["Could not detect CSV columns"] : [],
    suggestedIntents: ["analyze_cyber_artifact"],
    extractedText: content.slice(0, 8000),
  };
}

function parseLog(content: string, filename: string): ParseResult {
  const errors = content.match(/\b(error|exception|failed|timeout|500|403|401)\b/gi) ?? [];
  const timestamps = content.match(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/g) ?? [];
  return {
    summary: `Log file ${filename}: ${errors.length} error-like line(s) found${timestamps.length ? `; timestamps present` : ""}.`,
    importantFields: { errorMentions: errors.length, sampleTimestamps: timestamps.slice(0, 5) },
    warnings: [],
    suggestedIntents: ["investigate_support_issue", "analyze_uploaded_file"],
    extractedText: content.slice(0, 16000),
  };
}

export function formatAttachmentContextBlock(contexts: AttachmentContext[]): string {
  if (!contexts.length) return "";
  return contexts
    .map(
      (c) =>
        `[Attachment: ${c.filename} (${c.detectedType})]\n${c.summary}${c.warnings.length ? `\nWarnings: ${c.warnings.join("; ")}` : ""}`
    )
    .join("\n\n");
}
