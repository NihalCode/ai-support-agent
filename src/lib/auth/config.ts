import "server-only";

import { authEnvValidationError, cleanEnvValue, isAuthEnvComplete } from "@/lib/auth/env";
import { isTestMode } from "@/lib/test-mode";

/** True when Auth0 env is present and auth has not been explicitly disabled. */
export function isAuthConfigured(): boolean {
  if (process.env.AUTH_DISABLED === "true") return false;
  if (authEnvValidationError()) return false;
  return isAuthEnvComplete();
}

/** Auth enforcement is on when configured and not in test mode. */
export function isAuthEnabled(): boolean {
  if (isTestMode()) return false;
  return isAuthConfigured();
}

export function defaultOrgId(): string {
  return cleanEnvValue(process.env.DEFAULT_ORG_ID) ?? "default";
}
