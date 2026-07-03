import "server-only";

import { cleanEnvValue } from "@/lib/auth/env";

/** Resolve shared secret for Auth0 Post-Login Action → invite-check. */
export function resolveActionSharedSecret(): string | null {
  return cleanEnvValue(process.env.AUTH0_ACTION_SHARED_SECRET);
}
