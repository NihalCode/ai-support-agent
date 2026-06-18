import type {
  NormalizedApiSpec,
  NormalizedEndpoint,
  NormalizedParam,
} from "../types";
import { effectForEndpoint, fieldsFromSchema, specSlug } from "./normalize";

/**
 * Parse a Postman Collection (v2.0/v2.1) into the common NormalizedApiSpec.
 * Walks nested folders, resolves {{variables}} from collection variables, and
 * converts each request into a normalized endpoint with header/query/body info.
 */

export function looksLikePostman(text: string): boolean {
  const head = text.slice(0, 6000);
  return /_postman_id/.test(head) || /schema\.getpostman\.com/.test(head);
}

export function parsePostman(text: string, fallbackName?: string): NormalizedApiSpec {
  const doc = JSON.parse(text) as PostmanCollection;
  const name = doc.info?.name ?? fallbackName ?? "Postman Collection";
  const variables = collectVariables(doc.variable);

  const endpoints: NormalizedEndpoint[] = [];
  walkItems(doc.item ?? [], [], variables, endpoints);

  // Base URL: most common scheme+host across endpoints.
  const baseUrl = inferBaseUrl(endpoints, variables);
  const authType = doc.auth?.type ?? "none";

  return {
    id: specSlug(name),
    name,
    description: typeof doc.info?.description === "string" ? doc.info.description : undefined,
    baseUrl,
    authType,
    sourceKind: "postman",
    variables,
    endpoints,
    createdAt: new Date().toISOString(),
  };
}

function collectVariables(vars?: PostmanVar[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of vars ?? []) {
    if (v.key && typeof v.value === "string" && !isSecretKey(v.key)) out[v.key] = v.value;
  }
  return out;
}

function isSecretKey(key: string): boolean {
  return /(token|secret|password|api[-_]?key|auth|bearer)/i.test(key);
}

function resolveVars(input: string, vars: Record<string, string>): string {
  return input.replace(/\{\{([^}]+)\}\}/g, (_m, k: string) => vars[k.trim()] ?? `{{${k.trim()}}}`);
}

function walkItems(
  items: PostmanItem[],
  folders: string[],
  vars: Record<string, string>,
  out: NormalizedEndpoint[]
) {
  for (const item of items) {
    if (item.item) {
      walkItems(item.item, [...folders, item.name ?? ""], vars, out);
    } else if (item.request) {
      out.push(buildEndpoint(item, folders, vars));
    }
  }
}

function buildEndpoint(
  item: PostmanItem,
  folders: string[],
  vars: Record<string, string>
): NormalizedEndpoint {
  const req = item.request!;
  const method = (req.method ?? "GET").toUpperCase();
  const url = normalizeUrl(req.url, vars);

  const headers: NormalizedParam[] = (req.header ?? []).map((h) => ({
    name: h.key,
    location: "header" as const,
    required: !h.disabled,
    description: h.description,
    example: h.value,
  }));

  const queryParams: NormalizedParam[] = (extractQuery(req.url) ?? []).map((q) => ({
    name: q.key,
    location: "query" as const,
    required: !q.disabled,
    description: q.description,
    example: q.value,
  }));

  const pathParams: NormalizedParam[] = (extractPathVars(req.url) ?? []).map((p) => ({
    name: p.key,
    location: "path" as const,
    required: true,
    example: p.value,
  }));

  let bodySchema: unknown;
  if (req.body?.mode === "raw" && req.body.raw) {
    try {
      bodySchema = JSON.parse(resolveVars(req.body.raw, vars));
    } catch {
      bodySchema = { raw: req.body.raw.slice(0, 1000) };
    }
  } else if (req.body?.mode === "urlencoded") {
    bodySchema = Object.fromEntries((req.body.urlencoded ?? []).map((kv) => [kv.key, kv.value]));
  }
  // Treat top-level JSON body keys as fields.
  const { required, optional } =
    bodySchema && typeof bodySchema === "object" && !Array.isArray(bodySchema)
      ? { required: [] as string[], optional: Object.keys(bodySchema as object) }
      : fieldsFromSchema(bodySchema);

  const group = folders.filter(Boolean).join(" / ") || undefined;
  const text = `${item.name ?? ""} ${url.path} ${group ?? ""}`;
  const examples = (item.response ?? []).slice(0, 2).map((r) => ({
    name: r.name ?? "example",
    response: typeof r.body === "string" ? r.body.slice(0, 800) : undefined,
  }));

  return {
    name: item.name ?? `${method} ${url.path}`,
    description: typeof req.description === "string" ? req.description : undefined,
    method,
    path: url.path,
    headersRequired: headers.filter((h) => h.required),
    headersOptional: headers.filter((h) => !h.required),
    pathParams,
    queryParams,
    requestBodySchema: bodySchema,
    requiredFields: required,
    optionalFields: optional,
    responses: examples.length
      ? examples.map((e) => ({ status: "200", description: e.name, schema: e.response, isError: false }))
      : [],
    effect: effectForEndpoint(method, text),
    group,
    examples,
  };
}

function normalizeUrl(url: PostmanUrl | string | undefined, vars: Record<string, string>): { full: string; path: string } {
  if (!url) return { full: "", path: "/" };
  if (typeof url === "string") {
    const resolved = resolveVars(url, vars);
    return { full: resolved, path: pathOf(resolved) };
  }
  const raw = url.raw ?? "";
  const resolved = resolveVars(raw, vars);
  const path =
    Array.isArray(url.path) && url.path.length
      ? "/" + url.path.map((p) => resolveVars(p, vars)).join("/")
      : pathOf(resolved);
  return { full: resolved, path: path.replace(/:([A-Za-z0-9_]+)/g, "{$1}") };
}

function pathOf(u: string): string {
  try {
    return new URL(u).pathname || "/";
  } catch {
    const m = u.match(/^[^?]*/);
    return (m?.[0] ?? "/").replace(/^https?:\/\/[^/]+/, "") || "/";
  }
}

function extractQuery(url: PostmanUrl | string | undefined): PostmanKV[] | undefined {
  if (!url || typeof url === "string") return undefined;
  return url.query;
}

function extractPathVars(url: PostmanUrl | string | undefined): PostmanKV[] | undefined {
  if (!url || typeof url === "string") return undefined;
  return url.variable;
}

function inferBaseUrl(_endpoints: NormalizedEndpoint[], vars: Record<string, string>): string | null {
  return vars.baseUrl ?? vars.url ?? vars.base_url ?? null;
}

/* --------------------------------- types ---------------------------------- */

interface PostmanCollection {
  info?: { name?: string; description?: unknown; schema?: string };
  item?: PostmanItem[];
  variable?: PostmanVar[];
  auth?: { type?: string };
}
interface PostmanItem {
  name?: string;
  item?: PostmanItem[];
  request?: PostmanRequest;
  response?: { name?: string; body?: unknown }[];
}
interface PostmanRequest {
  method?: string;
  description?: unknown;
  header?: { key: string; value?: string; description?: string; disabled?: boolean }[];
  url?: PostmanUrl | string;
  body?: {
    mode?: string;
    raw?: string;
    urlencoded?: { key: string; value: string }[];
  };
}
interface PostmanUrl {
  raw?: string;
  path?: string[];
  query?: PostmanKV[];
  variable?: PostmanKV[];
}
interface PostmanKV {
  key: string;
  value?: string;
  description?: string;
  disabled?: boolean;
}
interface PostmanVar {
  key: string;
  value?: unknown;
}
