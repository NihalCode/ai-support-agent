import "server-only";

/** Trim env values and strip accidental wrapping quotes from Vercel/`.env` files. */
export function cleanEnvValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const unquoted = trimmed.slice(1, -1).trim();
    return unquoted || null;
  }
  return trimmed;
}

/** Canonical app origin — no trailing slash (Auth0 callback URLs must match exactly). */
export function normalizeAppBaseUrl(value: string | undefined): string | null {
  const clean = cleanEnvValue(value);
  if (!clean) return null;
  return clean.replace(/\/+$/, "");
}

export interface AuthEnv {
  domain: string | null;
  clientId: string | null;
  clientSecret: string | null;
  secret: string | null;
  appBaseUrl: string | null;
}

export function getAuthEnv(): AuthEnv {
  return {
    domain: cleanEnvValue(process.env.AUTH0_DOMAIN),
    clientId: cleanEnvValue(process.env.AUTH0_CLIENT_ID),
    clientSecret: cleanEnvValue(process.env.AUTH0_CLIENT_SECRET),
    secret: cleanEnvValue(process.env.AUTH0_SECRET),
    appBaseUrl: normalizeAppBaseUrl(process.env.APP_BASE_URL),
  };
}

export function isAuthEnvComplete(env: AuthEnv = getAuthEnv()): boolean {
  return Boolean(
    env.domain && env.clientId && env.clientSecret && env.secret && env.appBaseUrl
  );
}

export function validateAuthSecret(secret: string): string | null {
  if (secret.length < 32) {
    return "AUTH0_SECRET must be at least 32 characters.";
  }
  return null;
}

export function authEnvValidationError(env: AuthEnv = getAuthEnv()): string | null {
  if (!isAuthEnvComplete(env)) {
    return "Auth0 requires AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_SECRET, and APP_BASE_URL.";
  }
  return validateAuthSecret(env.secret!);
}
