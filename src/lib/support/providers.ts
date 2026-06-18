import "server-only";

import { getConfig, hasCyware } from "./config";
import { listSpecs } from "./api-specs/registry";

/**
 * Unified API-provider registry. Cyware is exposed as ONE provider among any
 * imported API specs — never a hardcoded-only path. The UI/agent enumerate
 * providers here to pick which API to reason about / execute against.
 */

export interface ApiProvider {
  id: string;
  name: string;
  kind: "cyware" | "spec";
  baseUrl: string | null;
  authType: string;
  configured: boolean;
  endpoints: number;
  specId?: string;
}

export function listProviders(): ApiProvider[] {
  const cfg = getConfig();
  const providers: ApiProvider[] = [];

  if (hasCyware(cfg)) {
    // Endpoints come from an imported Cyware spec, if present.
    const cywareSpec = listSpecs().find((s) => /cyware|ctix/i.test(s.id) || /cyware|ctix|intel/i.test(s.name));
    providers.push({
      id: "cyware",
      name: "Cyware Intel Exchange (CTIX)",
      kind: "cyware",
      baseUrl: cfg.cyware.baseUrl,
      authType: cfg.cyware.authType,
      configured: true,
      endpoints: cywareSpec?.endpoints.length ?? 0,
      specId: cywareSpec?.id,
    });
  }

  for (const spec of listSpecs()) {
    // Avoid double-listing the Cyware spec already attached above.
    if (providers.some((p) => p.specId === spec.id)) continue;
    providers.push({
      id: spec.id,
      name: spec.name,
      kind: "spec",
      baseUrl: spec.baseUrl,
      authType: spec.authType,
      configured: true,
      endpoints: spec.endpoints.length,
      specId: spec.id,
    });
  }

  return providers;
}
