import "server-only";

import { checkRateLimit } from "@/lib/auth/rate-limit";

const MUTATION_LIMIT = 30;
const MUTATION_WINDOW_MS = 60_000;

/** Existing limiter adapter keyed by trusted tenant and authenticated actor. */
export function checkEnterpriseMutationRateLimit(
  organizationId: string,
  userId: string
): boolean {
  return checkRateLimit(
    `enterprise-mutation:${organizationId}:${userId}`,
    MUTATION_LIMIT,
    MUTATION_WINDOW_MS
  );
}
