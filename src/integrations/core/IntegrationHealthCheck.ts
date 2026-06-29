import "server-only";

import { IntegrationRegistry } from "./IntegrationRegistry";
import type { IntegrationId } from "./IntegrationTypes";

/** Runs a live health check for supported integrations. */
export async function runIntegrationHealthCheck(
  id: IntegrationId
): Promise<{ ok: boolean; detail: string; checkedAt: string }> {
  const result = await IntegrationRegistry.healthCheck(id);
  return { ...result, checkedAt: new Date().toISOString() };
}
