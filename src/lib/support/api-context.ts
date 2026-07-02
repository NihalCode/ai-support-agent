import "server-only";

import type { CywareProductId } from "./cyware-products";
import { CYWARE_PRODUCT_PRESETS } from "./cyware-products";
import { loadBundledCywareSpec } from "./api-specs/bundled-specs";
import { getSpec, registerSpec } from "./api-specs/registry";
import { rankEndpoints, describeEndpoint, apiSpecNamespace } from "./api-specs";
import { resolveApiDocUrl } from "./cyware-doc-url";
import type { NormalizedApiSpec, NormalizedEndpoint, RetrievedChunk } from "./types";

const PRODUCT_PATTERNS: { id: CywareProductId; patterns: RegExp[] }[] = [
  {
    id: "orchestrate",
    patterns: [/\borchestrate\b/i, /\bplaybook\b/i, /\bworkflow run\b/i, /\bnode.?result/i],
  },
  {
    id: "ctix",
    patterns: [
      /\bctix\b/i,
      /\bindicator\b/i,
      /\bthreat data\b/i,
      /\bstix\b/i,
      /\bcql\b/i,
      /\/v3\/(tags|indicators|threat|enrichment|stix|objects)/i,
      /\/ping\//i,
      /\btags\/bulk\b/i,
    ],
  },
  {
    id: "csap",
    patterns: [/\bcsap\b/i, /\bintel card\b/i, /\bsecurity automation\b/i, /\balert\b/i],
  },
  {
    id: "cftr",
    patterns: [/\bcftr\b/i, /\bincident response\b/i, /\bfusion\b/i, /\bthreat response\b/i, /\bincident\b/i],
  },
];

/** Lexical search hints per product — improves rankEndpoints for multi-product tickets. */
const PRODUCT_RANK_QUERIES: Record<CywareProductId, string> = {
  orchestrate:
    "playbook run logs node result timeout retry playbook-result filter run playbook terminate",
  ctix: "enrich indicator threat data ingestion enrichment object uuid indicator details",
  csap: "create card alert intel publish json create alert update published",
  cftr: "create incident workflow post incident comment",
};

/** Always include these paths when the product is in scope (if they exist in the spec). */
const PINNED_PATH_PATTERNS: Record<CywareProductId, RegExp[]> = {
  orchestrate: [
    /playbook-result\/filter/i,
    /playbook-result\/\{?playbook_result/i,
    /playbook-result\/?$/i,
    /node-results/i,
    /playbook\/run/i,
  ],
  ctix: [/enrichment\/enrichment-object/i, /threat/i, /indicator/i, /enrichment/i],
  csap: [/create_card/i, /alert_update/i],
  cftr: [],
};

export interface CywareActionPlan {
  products: CywareProductId[];
  fixSteps: string[];
  customerResponse: string;
  endpointsByProduct: Record<string, { method: string; path: string; name: string }[]>;
}

/** Detect which Cyware API products a ticket/description refers to. */
export function detectCywareProducts(text: string): CywareProductId[] {
  const hits: CywareProductId[] = [];
  for (const { id, patterns } of PRODUCT_PATTERNS) {
    if (patterns.some((re) => re.test(text))) hits.push(id);
  }
  return hits;
}

export function ticketNeedsCql(text: string): boolean {
  return /\bcql\b/i.test(text) || /\bmalicious\s+ip\b/i.test(text) || /\bindicator.*(query|last \d+|confidence)/i.test(text);
}

function ensureSpec(specId: string, productId: CywareProductId): NormalizedApiSpec | null {
  let spec = getSpec(specId);
  if (spec?.endpoints?.length) return spec;
  const bundled = loadBundledCywareSpec(productId);
  if (!bundled?.endpoints?.length) return spec;
  const preset = CYWARE_PRODUCT_PRESETS[productId];
  spec = { ...bundled, id: specId, name: preset.name };
  registerSpec(spec);
  return spec;
}

function endpointChunk(spec: NormalizedApiSpec, ep: NormalizedEndpoint, score: number, tag: string): RetrievedChunk {
  const text = [`API: ${spec.name}`, describeEndpoint(ep, spec.baseUrl), ep.group ? `Group: ${ep.group}` : ""]
    .filter(Boolean)
    .join("\n");
  const sourceType = spec.sourceKind === "postman" ? "postman" : "openapi";
  return {
    id: `${apiSpecNamespace(spec.id)}:${tag}:${ep.method}:${ep.path}`.replace(/\s+/g, "_"),
    score,
    text,
    metadata: {
      repo: spec.id,
      branch: "api",
      filePath: `${ep.method} ${ep.path}`,
      language: "n/a",
      sourceType,
      title: ep.name,
      url: resolveApiDocUrl({ spec, endpoint: ep, sourceName: spec.name, sourceUrl: spec.sourceUrl }),
      source_name: spec.name,
      source_url: spec.sourceUrl,
      doc_url: ep.docUrl,
      endpoint_path: ep.path,
      http_method: ep.method,
    },
  };
}

function pinnedEndpoints(spec: NormalizedApiSpec, productId: CywareProductId): NormalizedEndpoint[] {
  const patterns = PINNED_PATH_PATTERNS[productId] ?? [];
  const out: NormalizedEndpoint[] = [];
  const seen = new Set<string>();
  for (const ep of spec.endpoints) {
    const hay = `${ep.method} ${ep.path} ${ep.name}`;
    const pathMatch = patterns.some((p) => p.test(hay) || p.test(ep.path));
    const createPost =
      (productId === "cftr" && ep.method === "POST" && /incident/i.test(`${ep.path} ${ep.name}`)) ||
      (productId === "cftr" && /create incident/i.test(ep.name));
    if (!pathMatch && !createPost) continue;
    const key = `${ep.method}:${ep.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ep);
  }
  return out;
}

function dedupeEndpoints(eps: NormalizedEndpoint[]): NormalizedEndpoint[] {
  const seen = new Set<string>();
  return eps.filter((ep) => {
    const key = `${ep.method}:${ep.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function endpointsForProduct(
  spec: NormalizedApiSpec,
  productId: CywareProductId,
  ticketText: string,
  limit: number
): NormalizedEndpoint[] {
  const rankQuery = `${PRODUCT_RANK_QUERIES[productId]} ${ticketText}`.slice(0, 2000);
  const pinned = pinnedEndpoints(spec, productId);
  const ranked = rankEndpoints(spec, rankQuery, limit);
  let merged = dedupeEndpoints([...pinned, ...ranked]);
  if (productId === "cftr") {
    const postCreate = spec.endpoints.find(
      (e) => e.method === "POST" && /create incident/i.test(e.name)
    );
    if (postCreate) merged = dedupeEndpoints([postCreate, ...merged]);
  }
  return merged.slice(0, limit);
}

/**
 * Lexical endpoint ranking (same engine as API Preview) — one batch per Cyware
 * product so multi-product tickets get Orchestrate + CTIX + CSAP + CFTR endpoints.
 */
export function retrieveApiEndpointContext(query: string, limitPerSpec = 4): RetrievedChunk[] {
  const products = detectCywareProducts(query);
  const specIds = new Set<string>();

  for (const productId of products) {
    specIds.add(CYWARE_PRODUCT_PRESETS[productId].specId);
  }

  if (specIds.size === 0 && /\b(which|what)\s+api\b/i.test(query)) {
    for (const preset of Object.values(CYWARE_PRODUCT_PRESETS)) specIds.add(preset.specId);
  }

  const out: RetrievedChunk[] = [];
  for (const specId of specIds) {
    const preset = Object.values(CYWARE_PRODUCT_PRESETS).find((p) => p.specId === specId);
    if (!preset) continue;
    const spec = ensureSpec(specId, preset.id);
    if (!spec?.endpoints?.length) continue;

    const eps = endpointsForProduct(spec, preset.id, query, limitPerSpec);
    eps.forEach((ep, i) => out.push(endpointChunk(spec, ep, 0.98 - i * 0.04, "rank")));
  }

  return out;
}

export function groupEndpointsByProduct(
  chunks: RetrievedChunk[]
): Record<string, { method: string; path: string; name: string }[]> {
  const grouped: Record<string, { method: string; path: string; name: string }[]> = {};
  for (const c of chunks) {
    if (c.metadata.sourceType !== "openapi" && c.metadata.sourceType !== "postman") continue;
    const label = c.metadata.repo ?? c.metadata.source_name ?? "API";
    if (!grouped[label]) grouped[label] = [];
    const ep = {
      method: c.metadata.http_method ?? c.metadata.filePath.split(" ")[0] ?? "GET",
      path: c.metadata.endpoint_path ?? c.metadata.filePath.replace(/^[A-Z]+\s+/, ""),
      name: c.metadata.title ?? c.metadata.filePath,
    };
    const key = `${ep.method}:${ep.path}`;
    if (!grouped[label].some((x) => `${x.method}:${x.path}` === key)) grouped[label].push(ep);
  }
  return grouped;
}

const VAGUE_STEP =
  /^(provide|assist|identify|guide|clarify|help)\s+(the client|with|on)|necessary apis|as soon as possible|currently investigating/i;

export function isVagueSupportStep(step: string): boolean {
  return VAGUE_STEP.test(step.trim());
}

export function isVagueCustomerResponse(text: string): boolean {
  return (
    /currently investigating/i.test(text) ||
    /as soon as possible/i.test(text) ||
    (!/\b(GET|POST|PUT|PATCH|DELETE)\s+\//i.test(text) && /will provide/i.test(text))
  );
}

/** Deterministic, production-grade steps from ranked API (+ optional CQL) context. */
export function buildCywareActionPlan(
  query: string,
  apiChunks: RetrievedChunk[],
  cqlChunks: RetrievedChunk[] = []
): CywareActionPlan | null {
  const products = detectCywareProducts(query);
  const endpointsByProduct = groupEndpointsByProduct(apiChunks);
  if (products.length === 0 && Object.keys(endpointsByProduct).length === 0) return null;

  const fixSteps: string[] = [];

  for (const productId of products) {
    const preset = CYWARE_PRODUCT_PRESETS[productId];
    const eps = endpointsByProduct[preset.specId] ?? endpointsByProduct[preset.name] ?? [];
    if (productId === "orchestrate") {
      const runLog = eps.find((e) => /playbook-result/i.test(e.path));
      const node = eps.find((e) => /node-result/i.test(e.path));
      const retry = eps.find((e) => /playbook\/run/i.test(e.path));
      if (runLog)
        fixSteps.push(
          `Orchestrate — check run status/logs: ${runLog.method} ${runLog.path} (${runLog.name}).`
        );
      if (node)
        fixSteps.push(
          `Orchestrate — inspect node-level failure: ${node.method} ${node.path} (${node.name}).`
        );
      if (retry)
        fixSteps.push(`Orchestrate — retry the playbook: ${retry.method} ${retry.path} (${retry.name}).`);
    } else if (productId === "ctix") {
      const enrich = eps.find((e) => /enrich|threat|indicator/i.test(`${e.path} ${e.name}`));
      if (enrich)
        fixSteps.push(
          `CTIX — enrich / fetch indicator data by ID: ${enrich.method} ${enrich.path} (${enrich.name}).`
        );
    } else if (productId === "csap") {
      const card = eps.find((e) => /create_card|alert/i.test(`${e.path} ${e.name}`));
      if (card)
        fixSteps.push(
          `CSAP — publish intel card/alert from JSON: ${card.method} ${card.path} (${card.name}).`
        );
    } else if (productId === "cftr") {
      const inc =
        eps.find((e) => e.method === "POST" && /incident/i.test(`${e.path} ${e.name}`)) ??
        eps.find((e) => /create incident/i.test(e.name));
      if (inc)
        fixSteps.push(
          `CFTR — create incident via API (separate call from Orchestrate): ${inc.method} ${inc.path} (${inc.name}).`
        );
    }
    const prefix =
      productId === "orchestrate"
        ? "Orchestrate"
        : productId === "ctix"
          ? "CTIX"
          : productId === "csap"
            ? "CSAP"
            : "CFTR";
    const productSteps = fixSteps.filter((s) => s.startsWith(prefix));
    if (productSteps.length === 0 && eps.length) {
      const best =
        productId === "cftr"
          ? eps.find((e) => e.method === "POST" && /incident|create incident/i.test(`${e.path} ${e.name}`)) ?? eps[0]
          : eps[0];
      fixSteps.push(`${prefix} — ${best.method} ${best.path} (${best.name}).`);
    }
  }

  if (ticketNeedsCql(query)) {
    if (cqlChunks.length > 0) {
      fixSteps.push(
        `CTIX CQL — filter malicious IP indicators (last 24h, confidence ≥ 90) using indexed CQL grammar docs.`
      );
    } else {
      fixSteps.push(
        "CTIX CQL — index CQL docs (Integrations → Cyware CQL → Index) then generate a query for malicious IP indicators in the last 24h with confidence ≥ 90."
      );
    }
  }

  const customerLines: string[] = [
    "Thank you for the detailed report. Here are the APIs and steps we recommend:",
  ];
  for (const step of fixSteps) customerLines.push(`• ${step}`);
  customerLines.push(
    "\nIf the playbook continues to timeout after 45s, pull node-level results for the failing step and share the playbook_result_unique_id so we can pinpoint the slow integration."
  );

  return {
    products,
    fixSteps,
    customerResponse: customerLines.join("\n"),
    endpointsByProduct,
  };
}

export function mergeFixSteps(llmSteps: string[] | null | undefined, deterministic: string[]): string[] {
  if (!deterministic.length) return dedupeSteps(llmSteps ?? []);
  const specific = (llmSteps ?? []).filter((s) => !isVagueSupportStep(s));
  const hasEndpoint = (s: string) => /\b(GET|POST|PUT|PATCH|DELETE)\s+\//i.test(s);
  const llmSpecific = specific.filter(hasEndpoint);
  if (llmSpecific.length >= deterministic.length) return dedupeSteps(specific);
  const merged = [...deterministic];
  for (const s of specific) {
    const norm = normalizeStep(s);
    if (!merged.some((m) => normalizeStep(m) === norm)) merged.push(s);
  }
  return dedupeSteps(merged);
}

function normalizeStep(s: string): string {
  const m = s.match(/\b(GET|POST|PUT|PATCH|DELETE)\s+(\S+)/i);
  if (m) return `${m[1].toUpperCase()} ${m[2].replace(/[),.;]+$/, "")}`.toLowerCase();
  return s.replace(/\s+/g, " ").replace(/[.!]+$/, "").trim().toLowerCase();
}

function dedupeSteps(steps: string[]): string[] {
  const seen = new Set<string>();
  return steps.filter((s) => {
    const key = normalizeStep(s);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function mergeRetrievedChunks(
  primary: RetrievedChunk[],
  injected: RetrievedChunk[],
  topK: number
): RetrievedChunk[] {
  const seen = new Set<string>();
  const out: RetrievedChunk[] = [];
  for (const c of [...injected, ...primary]) {
    const key = `${c.metadata.sourceType}:${c.metadata.filePath}:${c.text.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= topK) break;
  }
  return out;
}

export function formatApiContextForLlm(chunks: RetrievedChunk[]): string {
  const bySpec = groupEndpointsByProduct(chunks);
  const lines: string[] = [];
  for (const [specId, eps] of Object.entries(bySpec)) {
    const preset = Object.values(CYWARE_PRODUCT_PRESETS).find((p) => p.specId === specId);
    lines.push(preset?.name ?? specId);
    for (const ep of eps.slice(0, 5)) {
      lines.push(`  - ${ep.method} ${ep.path} — ${ep.name}`);
    }
  }
  return lines.join("\n");
}
