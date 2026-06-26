import "server-only";

import type { CywareProductId } from "../cyware-products";
import { getCywareProductConfig, type CywareProductConfig } from "../config";
import { generateCtixAuthQuery } from "../ctix-auth";
import { redactHeaders } from "../redact";
import { classifyHttp } from "../safety";
import { listSpecs } from "../api-specs/registry";
import { rankEndpoints } from "../api-specs";
import type { NormalizedEndpoint, SafetyVerdict } from "../types";

export interface CywareRequestPlan {
  method: string;
  url: string;
  headers: Record<string, string>;
  redactedHeaders: Record<string, string>;
  body?: string;
  safety: SafetyVerdict;
}

const FLOW_INTENTS: Record<string, string> = {
  searchIndicators: "search indicators query threat data",
  lookupObject: "get object detail threat intel lookup",
  createTag: "create tag",
  addTag: "add tag indicator bulk attach",
  createRelationship: "create relationship between objects",
  listIncidents: "list incidents cases",
  runPlaybook: "run playbook orchestration workflow",
  createAction: "create action respond cftr",
};

export type CywareFlow = keyof typeof FLOW_INTENTS;

/**
 * Parameterized Cyware product connector — one instance per product (CTIX, CSAP,
 * CFTR, Orchestrate). Auth + base URL come from product-specific env vars;
 * endpoints come from the imported spec for that product.
 */
export class CywareProductConnector {
  readonly id: CywareProductId;

  constructor(productId: CywareProductId) {
    this.id = productId;
  }

  private cfg(): CywareProductConfig {
    return getCywareProductConfig(this.id);
  }

  get name(): string {
    return this.cfg().name;
  }

  get configured(): boolean {
    const c = this.cfg();
    return Boolean(c.baseUrl && (c.apiKey || c.clientSecret || (c.clientId && c.clientSecret)));
  }

  /** CTIX Open API uses HMAC query params (AccessID / Signature / Expires). */
  private usesCtixOpenApi(): boolean {
    if (this.id !== "ctix") return false;
    const c = this.cfg();
    if (c.authType === "basic" || c.authType === "bearer") return false;
    if (c.authType === "ctix_open_api") return Boolean(c.clientId && c.clientSecret);
    return Boolean(c.clientId && c.clientSecret && !c.apiKey);
  }

  private ctixAuthQuery(): Record<string, string> | null {
    if (!this.usesCtixOpenApi()) return null;
    const c = this.cfg();
    return { ...generateCtixAuthQuery(c.clientId!, c.clientSecret!) };
  }

  private applyAuth(headers: Record<string, string>): Record<string, string> {
    if (this.usesCtixOpenApi()) return headers;
    const c = this.cfg();
    switch (c.authType) {
      case "bearer":
        if (c.apiKey) headers.Authorization = `Bearer ${c.apiKey}`;
        break;
      case "basic":
        if (c.clientId && c.clientSecret) {
          headers.Authorization =
            "Basic " + Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64");
        }
        break;
      case "api_key":
      default:
        if (c.apiKey) headers.Authorization = `Apikey ${c.apiKey}`;
        break;
    }
    return headers;
  }

  /** Auth headers for this product (empty when not configured). */
  getAuthHeaders(): Record<string, string> {
    return this.applyAuth({});
  }

  async testConnection(): Promise<{ ok: boolean; detail: string }> {
    const c = this.cfg();
    if (!this.configured) {
      return { ok: false, detail: `${this.id.toUpperCase()} base URL + key not configured` };
    }
    try {
      const { safeFetch } = await import("../../ssrf");
      const base = c.baseUrl!.replace(/\/$/, "");
      const authQ = this.ctixAuthQuery();
      const testPath = this.id === "ctix" ? "/ping/" : "";
      const qs = authQ ? `?${new URLSearchParams(authQ).toString()}` : "";
      const res = await safeFetch(`${base}${testPath}${qs}`, {
        headers: this.applyAuth({ Accept: "application/json" }),
      });
      const ok = res.status < 500 && res.status !== 401 && res.status !== 403;
      return {
        ok,
        detail: ok
          ? `CTIX reachable (HTTP ${res.status})`
          : `Reachable but auth may be wrong (HTTP ${res.status})`,
      };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : "unreachable" };
    }
  }

  buildRequest(
    method: string,
    path: string,
    opts: { query?: Record<string, string>; body?: unknown; summary?: string; allowDestructive?: boolean } = {}
  ): CywareRequestPlan {
    const c = this.cfg();
    const base = c.baseUrl!.replace(/\/$/, "");
    const authQ = this.ctixAuthQuery();
    const mergedQuery = { ...(opts.query ?? {}), ...(authQ ?? {}) };
    const qs =
      Object.keys(mergedQuery).length > 0
        ? "?" + new URLSearchParams(mergedQuery).toString()
        : "";
    const url = `${base}${path.startsWith("/") ? path : `/${path}`}${qs}`;
    const headers = this.applyAuth({ Accept: "application/json", "Content-Type": "application/json" });
    const body = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;
    const safety = classifyHttp(method, opts.summary ?? `${method} ${path}`, {
      provider: this.id,
      allowDestructive: opts.allowDestructive,
    });
    return { method: method.toUpperCase(), url, headers, redactedHeaders: redactHeaders(headers), body, safety };
  }

  /** Resolve a flow against this product's imported spec. */
  resolveFlow(flow: CywareFlow): { spec: string; endpoint: NormalizedEndpoint } | null {
    const intent = FLOW_INTENTS[flow];
    const productPattern = new RegExp(this.id, "i");
    const specs = listSpecs().filter(
      (s) => productPattern.test(s.id) || productPattern.test(s.name) || /cyware/i.test(s.name)
    );
    const pool = specs.length ? specs : listSpecs();
    for (const spec of pool) {
      const ranked = rankEndpoints(spec, intent, 1);
      if (ranked.length) return { spec: spec.id, endpoint: ranked[0] };
    }
    return null;
  }
}

const cache = new Map<CywareProductId, CywareProductConnector>();

export function getCywareProductConnector(productId: CywareProductId = "ctix"): CywareProductConnector {
  let c = cache.get(productId);
  if (!c) {
    c = new CywareProductConnector(productId);
    cache.set(productId, c);
  }
  return c;
}
