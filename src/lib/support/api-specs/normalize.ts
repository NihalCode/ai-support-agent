import type { EndpointEffect, NormalizedEndpoint } from "../types";

/**
 * Shared helpers for normalizing API sources (OpenAPI/Swagger/Postman/etc.)
 * into the common internal schema. The effect classifier here feeds the safety
 * classifier so every imported endpoint carries a read/write/destructive tag.
 */

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Decide an endpoint's effect from its method + summary/path text. */
export function effectForEndpoint(method: string, text = ""): EndpointEffect {
  const m = method.toUpperCase();
  const s = text.toLowerCase();
  if (m === "DELETE" || /\b(delete|remove|destroy|purge|revoke|wipe)\b/.test(s)) {
    return "destructive";
  }
  if (/\b(bulk|batch|mass|multiple)\b/.test(s)) return "bulk";
  if (/\b(permission|role|scope|token|auth|api[-_\s]?key|credential|secret|grant|oauth)\b/.test(s)) {
    return "auth-changing";
  }
  if (READ_METHODS.has(m)) return "read";
  if (m === "POST" || m === "PUT" || m === "PATCH") return "write";
  return "read";
}

/** Build a stable slug id for a spec from its name. */
export function specSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "api";
}

/** Extract `{path}` template params from a URL path. */
export function pathParamNames(path: string): string[] {
  const out: string[] = [];
  const re = /\{([^}]+)\}|:([A-Za-z0-9_]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path))) out.push(m[1] ?? m[2]);
  return out;
}

/** Human-readable, copy-pasteable summary of one endpoint. */
export function describeEndpoint(ep: NormalizedEndpoint, baseUrl: string | null): string {
  const lines: string[] = [];
  lines.push(`${ep.method} ${ep.path}${ep.name && ep.name !== ep.path ? ` — ${ep.name}` : ""}`);
  if (ep.description) lines.push(ep.description);
  lines.push(`Effect: ${ep.effect}`);
  if (baseUrl) lines.push(`Base URL: ${baseUrl}`);
  if (ep.pathParams.length) lines.push(`Path params: ${ep.pathParams.map((p) => p.name).join(", ")}`);
  const reqQ = ep.queryParams.filter((p) => p.required).map((p) => p.name);
  const optQ = ep.queryParams.filter((p) => !p.required).map((p) => p.name);
  if (reqQ.length) lines.push(`Required query: ${reqQ.join(", ")}`);
  if (optQ.length) lines.push(`Optional query: ${optQ.join(", ")}`);
  const reqH = ep.headersRequired.map((h) => h.name);
  if (reqH.length) lines.push(`Required headers: ${reqH.join(", ")}`);
  if (ep.requiredFields.length) lines.push(`Required body fields: ${ep.requiredFields.join(", ")}`);
  if (ep.optionalFields.length) lines.push(`Optional body fields: ${ep.optionalFields.join(", ")}`);
  if (ep.requestBodySchema) {
    lines.push(`Request body: ${JSON.stringify(ep.requestBodySchema).slice(0, 600)}`);
  }
  const ok = ep.responses.find((r) => /^2/.test(r.status));
  if (ok?.schema) lines.push(`Response (${ok.status}): ${JSON.stringify(ok.schema).slice(0, 400)}`);
  const errs = ep.responses.filter((r) => r.isError).map((r) => r.status);
  if (errs.length) lines.push(`Error responses: ${errs.join(", ")}`);
  if (ep.pagination) lines.push(`Pagination: ${ep.pagination}`);
  if (ep.rateLimit) lines.push(`Rate limit: ${ep.rateLimit}`);
  return lines.join("\n");
}

/** Try to extract required-field names + optional-field names from a JSON schema-ish body. */
export function fieldsFromSchema(schema: unknown): { required: string[]; optional: string[] } {
  if (!schema || typeof schema !== "object") return { required: [], optional: [] };
  const s = schema as { properties?: Record<string, unknown>; required?: string[] };
  const props = s.properties && typeof s.properties === "object" ? Object.keys(s.properties) : [];
  const required = Array.isArray(s.required) ? s.required : [];
  const optional = props.filter((p) => !required.includes(p));
  return { required, optional };
}
