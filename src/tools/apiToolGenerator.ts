import type { ApiRegistryEntry } from "@/apiRegistry/apiSchema";
import { getApiRegistry } from "@/apiRegistry/apiRegistry";

export interface GeneratedApiTool {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
  endpoint: { method: string; path: string; specId: string };
  authRequired: string[];
  exampleCurl?: string;
}

function entryToTool(entry: ApiRegistryEntry): GeneratedApiTool {
  const slug = `${entry.method}_${entry.endpointPath}`
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  const params: GeneratedApiTool["parameters"] = {};
  for (const p of entry.pathParams) {
    params[p.name] = { type: "string", description: `Path param ${p.name}`, required: p.required };
  }
  for (const p of entry.queryParams) {
    params[p.name] = {
      type: "string",
      description: p.description ?? `Query param ${p.name}`,
      required: p.required,
    };
  }
  if (entry.method !== "GET" && entry.method !== "DELETE") {
    params.body = { type: "object", description: "Request JSON body", required: false };
  }
  return {
    name: `cyware_${slug}`.toLowerCase(),
    description: `${entry.method} ${entry.endpointPath} — ${entry.name}. ${entry.description.slice(0, 200)}`,
    parameters: params,
    endpoint: { method: entry.method, path: entry.endpointPath, specId: entry.specId },
    authRequired: entry.requiredCredentials,
    exampleCurl: entry.runnable
      ? `curl -X ${entry.method} '${entry.endpointPath}' -H 'Authorization: Bearer <token>'`
      : undefined,
  };
}

/** Generate LLM-callable tool definitions from the API registry. */
export function generateApiTools(opts: { pathFilter?: string; limit?: number } = {}): GeneratedApiTool[] {
  const registry = getApiRegistry();
  let entries = registry.listEntries();
  if (opts.pathFilter) {
    const q = opts.pathFilter.toLowerCase();
    entries = entries.filter((e) => e.endpointPath.toLowerCase().includes(q) || e.name.toLowerCase().includes(q));
  }
  return entries.slice(0, opts.limit ?? 50).map(entryToTool);
}

export function generateApiToolsForQuery(query: string, limit = 12): GeneratedApiTool[] {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const registry = getApiRegistry();
  return registry
    .listEntries()
    .map((entry) => {
      const hay = `${entry.name} ${entry.endpointPath} ${entry.description}`.toLowerCase();
      const score = terms.reduce((n, t) => (hay.includes(t) ? n + 1 : n), 0);
      return { entry, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => entryToTool(s.entry));
}
