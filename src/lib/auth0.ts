import { Auth0Client } from "@auth0/nextjs-auth0/server";

function authConfigured(): boolean {
  if (process.env.AUTH_DISABLED === "true") return false;
  const clean = (v: string | undefined) => (v?.trim() ? v.trim() : "");
  return Boolean(
    clean(process.env.AUTH0_DOMAIN) &&
      clean(process.env.AUTH0_CLIENT_ID) &&
      clean(process.env.AUTH0_CLIENT_SECRET) &&
      clean(process.env.AUTH0_SECRET)
  );
}

/** Auth0 SDK client — only instantiated when Auth0 env vars are configured. */
export const auth0 = authConfigured() ? new Auth0Client() : null;
