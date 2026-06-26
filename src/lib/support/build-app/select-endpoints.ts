import "server-only";

import { listSpecs } from "@/lib/support/api-specs/registry";
import type { BuildAppEndpointRef, BuildAppTemplateId } from "./types";
import { getTemplate } from "./templates";

const PRODUCT_TERMS: Record<string, string[]> = {
  CTIX: ["indicator", "ioc", "threat", "tag", "cql", "ctix"],
  CSAP: ["csap", "case", "alert", "collaboration"],
  Orchestrate: ["orchestrate", "workflow", "playbook", "automation"],
  CFTR: ["cftr", "respond", "incident", "case"],
};

function scoreEndpoint(
  path: string,
  name: string,
  terms: string[]
): number {
  const hay = `${path} ${name}`.toLowerCase();
  let score = 0;
  for (const t of terms) {
    if (hay.includes(t)) score += t.length >= 5 ? 2 : 1;
  }
  return score;
}

/** Select API endpoints from imported registry — never hallucinate paths. */
export function selectEndpointsForApp(
  message: string,
  templateId: BuildAppTemplateId
): BuildAppEndpointRef[] {
  const template = getTemplate(templateId);
  const defaults = template?.defaultEndpoints ?? [];
  const specs = listSpecs();
  if (specs.length === 0) return defaults;

  const m = message.toLowerCase();
  const product =
    Object.entries(PRODUCT_TERMS).find(([, terms]) => terms.some((t) => m.includes(t)))?.[0] ??
    template?.products[0] ??
    "CTIX";

  const terms = new Set<string>();
  for (const word of m.split(/\W+/)) {
    if (word.length >= 3) terms.add(word);
  }
  PRODUCT_TERMS[product]?.forEach((t) => terms.add(t));

  const scored: BuildAppEndpointRef[] = [];
  for (const spec of specs) {
    const specHay = spec.name.toLowerCase();
    if (product && !specHay.includes(product.toLowerCase())) {
      continue;
    }
    for (const ep of spec.endpoints) {
      const s = scoreEndpoint(ep.path, ep.name, [...terms]);
      if (s > 0) {
        scored.push({
          method: ep.method,
          path: ep.path,
          name: ep.name,
          product: product,
        });
      }
    }
  }

  scored.sort((a, b) => {
    const sa = scoreEndpoint(a.path, a.name ?? "", [...terms]);
    const sb = scoreEndpoint(b.path, b.name ?? "", [...terms]);
    return sb - sa;
  });

  const unique = [...new Map(scored.map((e) => [`${e.method}:${e.path}`, e])).values()];
  if (unique.length > 0) return unique.slice(0, 4);
  return defaults;
}
