import type { ApiSourceKind } from "@/lib/support/types";
import { detectKind } from "@/lib/support/api-specs";
import { looksLikeTheneoUrl } from "@/lib/support/api-specs/theneo";
import { looksLikePostmanDocumenterUrl } from "@/lib/support/api-specs/postman-documenter";

export type DetectedSourceType =
  | ApiSourceKind
  | "theneo"
  | "postman-documenter"
  | "cql-docs"
  | "runnable-docs"
  | "unknown";

export interface SourceDetectionResult {
  kind: DetectedSourceType;
  confidence: "high" | "medium" | "low";
  hint?: string;
}

/** Detect API documentation source type from URL or raw content. */
export function detectSource(input: { url?: string; content?: string; hint?: ApiSourceKind }): SourceDetectionResult {
  const url = input.url?.trim();
  const content = input.content?.trim() ?? "";

  if (url) {
    if (/cql|cyware-query-language/i.test(url)) {
      return { kind: "cql-docs", confidence: "high", hint: "Cyware Query Language documentation" };
    }
    if (looksLikeTheneoUrl(url)) {
      return { kind: "theneo", confidence: "high", hint: "Theneo / Cyware API reference (llms.txt)" };
    }
    if (looksLikePostmanDocumenterUrl(url)) {
      return { kind: "postman-documenter", confidence: "high", hint: "Postman Documenter collection" };
    }
    if (/swagger|openapi/i.test(url)) {
      return { kind: "openapi", confidence: "medium", hint: "OpenAPI/Swagger URL" };
    }
    if (/postman/i.test(url)) {
      return { kind: "postman", confidence: "medium", hint: "Postman collection URL" };
    }
    if (/\.(yaml|yml|json)(\?|$)/i.test(url)) {
      return { kind: "openapi", confidence: "low", hint: "Structured spec file — will sniff content" };
    }
  }

  if (content) {
    const kind = detectKind(content, input.hint);
    if (/cql|cyware query language|indicator_type/i.test(content.slice(0, 8000))) {
      return { kind: "cql-docs", confidence: "medium", hint: "CQL documentation content" };
    }
    return { kind, confidence: "high" };
  }

  return { kind: "unknown", confidence: "low", hint: "Provide a URL or raw spec/docs content" };
}
