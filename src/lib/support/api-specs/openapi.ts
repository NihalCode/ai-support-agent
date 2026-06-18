import { parse as parseYaml } from "yaml";
import type {
  NormalizedApiSpec,
  NormalizedEndpoint,
  NormalizedParam,
  NormalizedResponse,
  ParamLocation,
} from "../types";
import { effectForEndpoint, fieldsFromSchema, specSlug } from "./normalize";

/**
 * Parse OpenAPI 3.x and Swagger 2.0 documents (JSON or YAML) into the common
 * NormalizedApiSpec. Best-effort `$ref` resolution within the same document.
 */

export function looksLikeOpenApi(text: string): boolean {
  return /"?(openapi|swagger)"?\s*:/.test(text.slice(0, 2000));
}

export function parseOpenApi(text: string, fallbackName?: string): NormalizedApiSpec {
  const doc = loadDoc(text);
  const isV2 = typeof doc.swagger === "string";
  const name = doc.info?.title ?? fallbackName ?? "Imported API";
  const baseUrl = resolveBaseUrl(doc, isV2);
  const authType = resolveAuth(doc, isV2);

  const endpoints: NormalizedEndpoint[] = [];
  const paths = doc.paths ?? {};
  for (const [path, item] of Object.entries(paths)) {
    if (!item || typeof item !== "object") continue;
    const pathLevelParams = (item as PathItem).parameters ?? [];
    for (const method of ["get", "post", "put", "patch", "delete", "head", "options"] as const) {
      const op = (item as PathItem)[method] as Operation | undefined;
      if (!op) continue;
      endpoints.push(
        buildEndpoint(method.toUpperCase(), path, op, [...pathLevelParams], doc, isV2)
      );
    }
  }

  return {
    id: specSlug(name),
    name,
    description: doc.info?.description,
    baseUrl,
    authType,
    sourceKind: isV2 ? "swagger" : "openapi",
    endpoints,
    createdAt: new Date().toISOString(),
  };
}

function loadDoc(text: string): OpenApiDoc {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed) as OpenApiDoc;
  return parseYaml(trimmed) as OpenApiDoc;
}

function resolveBaseUrl(doc: OpenApiDoc, isV2: boolean): string | null {
  if (isV2) {
    const scheme = doc.schemes?.[0] ?? "https";
    if (doc.host) return `${scheme}://${doc.host}${doc.basePath ?? ""}`;
    return doc.basePath ?? null;
  }
  return doc.servers?.[0]?.url ?? null;
}

function resolveAuth(doc: OpenApiDoc, isV2: boolean): string {
  const schemes = isV2 ? doc.securityDefinitions : doc.components?.securitySchemes;
  if (!schemes) return "none";
  const first = Object.values(schemes)[0] as { type?: string; scheme?: string } | undefined;
  if (!first) return "none";
  if (first.type === "http") return first.scheme ?? "http";
  if (first.type === "apiKey") return "apiKey";
  if (first.type === "oauth2") return "oauth2";
  return first.type ?? "none";
}

function buildEndpoint(
  method: string,
  path: string,
  op: Operation,
  params: Parameter[],
  doc: OpenApiDoc,
  isV2: boolean
): NormalizedEndpoint {
  const merged = [...params, ...(op.parameters ?? [])].map((p) => resolveRef(p, doc));
  const toParam = (p: Parameter): NormalizedParam => ({
    name: p.name,
    location: (p.in ?? "query") as ParamLocation,
    required: Boolean(p.required) || p.in === "path",
    type: p.schema?.type ?? p.type,
    description: p.description,
    enum: p.schema?.enum ?? p.enum,
  });

  const all = merged.map(toParam);
  const pathParams = all.filter((p) => p.location === "path");
  const queryParams = all.filter((p) => p.location === "query");
  const headersRequired = all.filter((p) => p.location === "header" && p.required);
  const headersOptional = all.filter((p) => p.location === "header" && !p.required);

  // Body: OAS3 requestBody.content[json].schema; Swagger2 body param.
  let bodySchema: unknown;
  if (isV2) {
    const bodyParam = merged.find((p) => p.in === "body");
    bodySchema = bodyParam?.schema ? resolveSchema(bodyParam.schema, doc) : undefined;
  } else if (op.requestBody) {
    const rb = resolveRef(op.requestBody, doc) as RequestBody;
    const json = rb?.content?.["application/json"] ?? Object.values(rb?.content ?? {})[0];
    bodySchema = json?.schema ? resolveSchema(json.schema, doc) : undefined;
  }
  const { required, optional } = fieldsFromSchema(bodySchema);

  const responses: NormalizedResponse[] = Object.entries(op.responses ?? {}).map(
    ([status, r]) => {
      const resolved = resolveRef(r, doc) as ResponseObj;
      const schema = isV2
        ? resolved?.schema
        : resolved?.content?.["application/json"]?.schema ??
          Object.values(resolved?.content ?? {})[0]?.schema;
      return {
        status,
        description: resolved?.description,
        schema: schema ? resolveSchema(schema, doc) : undefined,
        isError: /^[45]/.test(status),
      };
    }
  );

  const text = `${op.summary ?? ""} ${op.description ?? ""} ${path} ${(op.tags ?? []).join(" ")}`;
  return {
    operationId: op.operationId,
    name: op.summary ?? op.operationId ?? path,
    description: op.description,
    method,
    path,
    headersRequired,
    headersOptional,
    pathParams,
    queryParams,
    requestBodySchema: bodySchema,
    requiredFields: required,
    optionalFields: optional,
    responses,
    effect: effectForEndpoint(method, text),
    group: op.tags?.[0],
  };
}

/* ----------------------------- $ref resolution ---------------------------- */

function resolveRef<T>(node: T, doc: OpenApiDoc): T {
  const ref = (node as { $ref?: string })?.$ref;
  if (!ref || !ref.startsWith("#/")) return node;
  const parts = ref.slice(2).split("/");
  let cur: unknown = doc;
  for (const p of parts) {
    cur = (cur as Record<string, unknown>)?.[decodeURIComponent(p.replace(/~1/g, "/").replace(/~0/g, "~"))];
    if (cur === undefined) return node;
  }
  return cur as T;
}

function resolveSchema(schema: unknown, doc: OpenApiDoc, depth = 0): unknown {
  if (depth > 4 || !schema || typeof schema !== "object") return schema;
  const resolved = resolveRef(schema, doc) as Record<string, unknown>;
  if (resolved.properties && typeof resolved.properties === "object") {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(resolved.properties as Record<string, unknown>)) {
      props[k] = resolveSchema(v, doc, depth + 1);
    }
    return { ...resolved, properties: props };
  }
  return resolved;
}

/* --------------------------------- types ---------------------------------- */

interface OpenApiDoc {
  openapi?: string;
  swagger?: string;
  info?: { title?: string; description?: string };
  servers?: { url: string }[];
  host?: string;
  basePath?: string;
  schemes?: string[];
  paths?: Record<string, PathItem>;
  components?: { securitySchemes?: Record<string, unknown> };
  securityDefinitions?: Record<string, unknown>;
}
interface PathItem {
  parameters?: Parameter[];
  get?: Operation;
  post?: Operation;
  put?: Operation;
  patch?: Operation;
  delete?: Operation;
  head?: Operation;
  options?: Operation;
}
interface Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: Parameter[];
  requestBody?: unknown;
  responses?: Record<string, unknown>;
}
interface Parameter {
  name: string;
  in?: string;
  required?: boolean;
  description?: string;
  type?: string;
  enum?: string[];
  schema?: { type?: string; enum?: string[] };
  $ref?: string;
}
interface RequestBody {
  content?: Record<string, { schema?: unknown }>;
}
interface ResponseObj {
  description?: string;
  schema?: unknown;
  content?: Record<string, { schema?: unknown }>;
}
