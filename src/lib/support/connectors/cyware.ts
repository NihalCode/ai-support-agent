import "server-only";

import { getConfig } from "../config";
import { redactHeaders } from "../redact";
import { classifyHttp } from "../safety";
import { listSpecs } from "../api-specs/registry";
import { rankEndpoints } from "../api-specs";
import type { NormalizedEndpoint, SafetyVerdict } from "../types";

/**
 * Cyware API provider. Cyware is treated as ONE configurable API provider (not
 * a hardcoded path): auth + base URL come from CYWARE_* env, and endpoints come
 * from an imported Cyware OpenAPI/Postman spec (RAG-retrievable). This connector
 * builds authenticated, previewable, approval-gated requests and offers helper
 * "flows" that resolve to endpoints in the imported spec.
 */

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
};

export type CywareFlow = keyof typeof FLOW_INTENTS;

export class CywareConnector {
  readonly id = "cyware";
  private baseUrl: string;
  private apiKey: string | null;
  private clientId: string | null;
  private clientSecret: string | null;
  private authType: string;

  constructor() {
    const c = getConfig().cyware;
    this.baseUrl = (c.baseUrl ?? "").replace(/\/$/, "");
    this.apiKey = c.apiKey;
    this.clientId = c.clientId;
    this.clientSecret = c.clientSecret;
    this.authType = c.authType;
  }

  get configured(): boolean {
    return Boolean(this.baseUrl && (this.apiKey || this.clientSecret));
  }

  /** Build auth headers/query for the configured auth type. */
  private applyAuth(headers: Record<string, string>): Record<string, string> {
    switch (this.authType) {
      case "bearer":
        if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
        break;
      case "basic":
        if (this.clientId && this.clientSecret) {
          headers.Authorization = "Basic " + Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
        }
        break;
      case "api_key":
      default:
        // Cyware-style API key header; operators can override via an imported spec's auth.
        if (this.apiKey) headers.Authorization = `Apikey ${this.apiKey}`;
        break;
    }
    return headers;
  }

  async testConnection(): Promise<{ ok: boolean; detail: string }> {
    if (!this.configured) return { ok: false, detail: "CYWARE_BASE_URL + key not configured" };
    try {
      const { safeFetch } = await import("../../ssrf");
      const res = await safeFetch(this.baseUrl, { headers: this.applyAuth({ Accept: "application/json" }) });
      return { ok: res.status < 500, detail: `Reachable (HTTP ${res.status})` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : "unreachable" };
    }
  }

  /** Produce a fully-resolved, redacted, safety-classified request plan. */
  buildRequest(
    method: string,
    path: string,
    opts: { query?: Record<string, string>; body?: unknown; summary?: string; allowDestructive?: boolean } = {}
  ): CywareRequestPlan {
    const qs = opts.query && Object.keys(opts.query).length
      ? "?" + new URLSearchParams(opts.query).toString()
      : "";
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}${qs}`;
    const headers = this.applyAuth({ Accept: "application/json", "Content-Type": "application/json" });
    const body = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;
    const safety = classifyHttp(method, opts.summary ?? `${method} ${path}`, {
      provider: "cyware",
      allowDestructive: opts.allowDestructive,
    });
    return { method: method.toUpperCase(), url, headers, redactedHeaders: redactHeaders(headers), body, safety };
  }

  /** Resolve a high-level flow to an endpoint in the imported Cyware spec (best-effort). */
  resolveFlow(flow: CywareFlow): { spec: string; endpoint: NormalizedEndpoint } | null {
    const intent = FLOW_INTENTS[flow];
    const specs = listSpecs().filter((s) => /cyware|ctix|intel/i.test(s.name) || /cyware|ctix/i.test(s.id));
    const pool = specs.length ? specs : listSpecs();
    for (const spec of pool) {
      const ranked = rankEndpoints(spec, intent, 1);
      if (ranked.length) return { spec: spec.id, endpoint: ranked[0] };
    }
    return null;
  }
}

export function getCywareConnector(): CywareConnector {
  return new CywareConnector();
}
