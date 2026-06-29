import "server-only";

import { isTestMode } from "@/lib/test-mode";

function clean(v: string | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/** True when Auth0 env is present and auth has not been explicitly disabled. */
export function isAuthConfigured(): boolean {
  if (process.env.AUTH_DISABLED === "true") return false;
  return Boolean(
    clean(process.env.AUTH0_DOMAIN) &&
      clean(process.env.AUTH0_CLIENT_ID) &&
      clean(process.env.AUTH0_CLIENT_SECRET) &&
      clean(process.env.AUTH0_SECRET)
  );
}

/** Auth enforcement is on when configured and not in test mode. */
export function isAuthEnabled(): boolean {
  if (isTestMode()) return false;
  return isAuthConfigured();
}

export function defaultOrgId(): string {
  return clean(process.env.DEFAULT_ORG_ID) ?? "default";
}
