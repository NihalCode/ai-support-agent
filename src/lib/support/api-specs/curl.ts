import type { NormalizedApiSpec, NormalizedEndpoint, NormalizedParam } from "../types";
import { effectForEndpoint, pathParamNames, specSlug } from "./normalize";

/**
 * Parse one or more cURL commands into a NormalizedApiSpec. Handles -X/--request,
 * -H/--header, -d/--data/--data-raw, and the URL. Multiple commands (separated
 * by blank lines) become multiple endpoints.
 */

export function looksLikeCurl(text: string): boolean {
  return /(^|\s)curl\s/.test(text.slice(0, 2000));
}

export function parseCurl(text: string, fallbackName = "cURL import"): NormalizedApiSpec {
  const commands = splitCommands(text);
  const endpoints: NormalizedEndpoint[] = [];
  let baseUrl: string | null = null;

  for (const cmd of commands) {
    const ep = parseOne(cmd);
    if (!ep) continue;
    endpoints.push(ep.endpoint);
    if (!baseUrl && ep.origin) baseUrl = ep.origin;
  }

  return {
    id: specSlug(fallbackName),
    name: fallbackName,
    baseUrl,
    authType: endpoints.some((e) => e.headersRequired.some((h) => /authorization/i.test(h.name)))
      ? "bearer"
      : "none",
    sourceKind: "curl",
    endpoints,
    createdAt: new Date().toISOString(),
  };
}

function splitCommands(text: string): string[] {
  // Join line-continuations, then split on each `curl` occurrence.
  const joined = text.replace(/\\\s*\n/g, " ");
  return joined
    .split(/\n(?=\s*curl\s)/)
    .map((c) => c.trim())
    .filter((c) => /curl/.test(c));
}

function parseOne(cmd: string): { endpoint: NormalizedEndpoint; origin: string | null } | null {
  const tokens = tokenize(cmd);
  let method = "";
  const headers: NormalizedParam[] = [];
  let body: string | undefined;
  let url = "";

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "-X" || t === "--request") {
      method = (tokens[++i] ?? "").toUpperCase();
    } else if (t === "-H" || t === "--header") {
      const h = tokens[++i] ?? "";
      const idx = h.indexOf(":");
      if (idx > 0) {
        headers.push({ name: h.slice(0, idx).trim(), location: "header", required: true, example: h.slice(idx + 1).trim() });
      }
    } else if (t === "-d" || t === "--data" || t === "--data-raw" || t === "--data-binary") {
      body = tokens[++i];
    } else if (/^https?:\/\//.test(t)) {
      url = t;
    } else if (t === "curl") {
      continue;
    } else if (!t.startsWith("-") && !url && /\//.test(t)) {
      url = t;
    }
  }

  if (!url) return null;
  if (!method) method = body ? "POST" : "GET";

  let path = url;
  let origin: string | null = null;
  let query: NormalizedParam[] = [];
  try {
    const u = new URL(url);
    origin = `${u.protocol}//${u.host}`;
    path = u.pathname;
    query = [...u.searchParams.keys()].map((k) => ({ name: k, location: "query" as const, required: false }));
  } catch {
    /* relative URL */
  }

  let bodySchema: unknown;
  if (body) {
    try {
      bodySchema = JSON.parse(body);
    } catch {
      bodySchema = { raw: body.slice(0, 500) };
    }
  }
  const optionalFields =
    bodySchema && typeof bodySchema === "object" && !Array.isArray(bodySchema)
      ? Object.keys(bodySchema as object)
      : [];

  const endpoint: NormalizedEndpoint = {
    name: `${method} ${path}`,
    method,
    path,
    headersRequired: headers,
    headersOptional: [],
    pathParams: pathParamNames(path).map((n) => ({ name: n, location: "path", required: true })),
    queryParams: query,
    requestBodySchema: bodySchema,
    requiredFields: [],
    optionalFields,
    responses: [],
    effect: effectForEndpoint(method, path),
  };
  return { endpoint, origin };
}

function tokenize(cmd: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cmd))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}
