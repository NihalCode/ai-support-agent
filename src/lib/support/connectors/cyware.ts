import "server-only";

/**
 * Backward-compatible CTIX connector — delegates to CywareProductConnector.
 * New code should use getCywareProductConnector(productId) directly.
 */

import type { NormalizedEndpoint } from "../types";
import {
  getCywareProductConnector,
  type CywareFlow,
  type CywareRequestPlan,
} from "./cyware-product";

export type { CywareFlow, CywareRequestPlan };

export class CywareConnector {
  readonly id = "cyware";

  get configured(): boolean {
    return getCywareProductConnector("ctix").configured;
  }

  async testConnection(): Promise<{ ok: boolean; detail: string }> {
    return getCywareProductConnector("ctix").testConnection();
  }

  buildRequest(
    method: string,
    path: string,
    opts: { query?: Record<string, string>; body?: unknown; summary?: string; allowDestructive?: boolean } = {}
  ): CywareRequestPlan {
    return getCywareProductConnector("ctix").buildRequest(method, path, opts);
  }

  resolveFlow(flow: CywareFlow): { spec: string; endpoint: NormalizedEndpoint } | null {
    return getCywareProductConnector("ctix").resolveFlow(flow);
  }
}

export function getCywareConnector(): CywareConnector {
  return new CywareConnector();
}
