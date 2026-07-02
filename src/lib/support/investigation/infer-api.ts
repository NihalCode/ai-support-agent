import "server-only";

import { listSpecs } from "@/lib/support/api-specs/registry";
import type { SupportQuery } from "./types";
import { buildSearchTerms, isCqlAuthoringRequest } from "./extract-query";

const WORKFLOW_TERMS: Record<string, string[]> = {
  block: ["indicator", "block", "action", "ip", "deny"],
  malicious: ["indicator", "malicious", "threat", "ip"],
  ip: ["indicator", "ip", "address"],
  workflow: ["orchestrat", "playbook", "automation", "action"],
  indicator: ["indicator", "threat", "ioc"],
  tag: ["tag", "bulk"],
  search: ["search", "query", "filter"],
  cql: ["cql", "query", "filter"],
};

function termsFromQuery(q: SupportQuery): string[] {
  const blob = buildSearchTerms(q).toLowerCase();
  const terms = new Set<string>();
  for (const word of blob.split(/\W+/)) {
    if (word.length >= 3) terms.add(word);
    const mapped = WORKFLOW_TERMS[word];
    if (mapped) mapped.forEach((t) => terms.add(t));
  }
  if (q.workflowName) {
    for (const word of q.workflowName.toLowerCase().split(/\W+/)) {
      if (word.length >= 3) terms.add(word);
      WORKFLOW_TERMS[word]?.forEach((t) => terms.add(t));
    }
  }
  return [...terms];
}

function scoreEndpoint(path: string, summary: string, terms: string[]): number {
  const hay = `${path} ${summary}`.toLowerCase();
  let score = 0;
  for (const t of terms) {
    if (hay.includes(t)) score += t.length >= 5 ? 2 : 1;
  }
  return score;
}

/** Infer likely API endpoints from imported specs when the user did not provide one. */
export function inferEndpointsFromDocs(query: SupportQuery): string[] {
  if (query.endpoint) return [query.endpoint];

  const terms = termsFromQuery(query);
  if (terms.length === 0) return [];

  const scored: { path: string; score: number }[] = [];
  for (const spec of listSpecs()) {
    for (const ep of spec.endpoints) {
      const path = ep.path;
      const summary = [ep.name, ep.description, ep.operationId].filter(Boolean).join(" ");
      const score = scoreEndpoint(path, summary, terms);
      if (score > 0) scored.push({ path, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const unique = [...new Set(scored.map((s) => s.path))];
  return unique.slice(0, 5);
}

/** Enrich query with inferred endpoint(s) for agent search — does not overwrite explicit endpoint. */
export function enrichWithEndpointInference(query: SupportQuery): SupportQuery {
  if (isCqlAuthoringRequest(query.text ?? "", query)) return query;
  if (query.endpoint) return query;

  const inferred = inferEndpointsFromDocs(query);
  if (inferred.length === 0) return query;

  return {
    ...query,
    inferredEndpoints: inferred,
    endpoint: inferred[0],
    feature: query.feature ?? query.workflowName,
  };
}

export function describeEndpointInference(query: SupportQuery): string | null {
  if (query.endpoint && !query.inferredEndpoints?.length) return null;
  const inferred = query.inferredEndpoints ?? inferEndpointsFromDocs(query);
  if (inferred.length === 0) {
    if (query.workflowName || query.likelyCategory) {
      return "I don't have the exact endpoint yet, but based on your description I'm checking imported API docs for related workflows and actions.";
    }
    return null;
  }
  return `Based on your description I'm checking imported API docs — likely endpoints include ${inferred.slice(0, 3).join(", ")}.`;
}
