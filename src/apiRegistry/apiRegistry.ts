import "server-only";

import { listSpecs, getSpec } from "@/lib/support/api-specs/registry";
import { entryFromEndpoint, type ApiRegistryEntry } from "./apiSchema";

/** Queryable registry of all imported API endpoints. */
export class ApiRegistry {
  listEntries(): ApiRegistryEntry[] {
    return listSpecs().flatMap((spec) => spec.endpoints.map((ep) => entryFromEndpoint(spec, ep)));
  }

  listBySpec(specId: string): ApiRegistryEntry[] {
    const spec = getSpec(specId);
    if (!spec) return [];
    return spec.endpoints.map((ep) => entryFromEndpoint(spec, ep));
  }

  findByPath(pathFragment: string, limit = 20): ApiRegistryEntry[] {
    const q = pathFragment.toLowerCase();
    return this.listEntries()
      .filter((e) => e.endpointPath.toLowerCase().includes(q) || e.name.toLowerCase().includes(q))
      .slice(0, limit);
  }

  findByMethodAndPath(method: string, path: string): ApiRegistryEntry | null {
    const m = method.toUpperCase();
    return (
      this.listEntries().find(
        (e) => e.method.toUpperCase() === m && e.endpointPath.toLowerCase() === path.toLowerCase()
      ) ?? null
    );
  }

  summary(): { specs: number; endpoints: number; products: string[] } {
    const specs = listSpecs();
    return {
      specs: specs.length,
      endpoints: specs.reduce((n, s) => n + s.endpoints.length, 0),
      products: [...new Set(specs.map((s) => s.name))],
    };
  }
}

let singleton: ApiRegistry | null = null;

export function getApiRegistry(): ApiRegistry {
  singleton ??= new ApiRegistry();
  return singleton;
}
