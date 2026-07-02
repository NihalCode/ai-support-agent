import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { InvalidStateError, MissingStateError } from "@auth0/nextjs-auth0/errors";
import { NextResponse } from "next/server";

import {
  authEnvValidationError,
  getAuthEnv,
  isAuthEnvComplete,
} from "@/lib/auth/env";

function loginErrorRedirect(appBaseUrl: string, code: string, message?: string): NextResponse {
  const url = new URL("/login", appBaseUrl);
  url.searchParams.set("error", code);
  if (message) {
    url.searchParams.set("message", message);
  }
  return NextResponse.redirect(url);
}

function authConfigured(): boolean {
  if (process.env.AUTH_DISABLED === "true") return false;
  if (authEnvValidationError()) return false;
  return isAuthEnvComplete();
}

function createAuth0Client(): Auth0Client {
  const env = getAuthEnv();
  const validationError = authEnvValidationError(env);
  if (validationError) {
    throw new Error(validationError);
  }

  return new Auth0Client({
    domain: env.domain!,
    clientId: env.clientId!,
    clientSecret: env.clientSecret!,
    secret: env.secret!,
    appBaseUrl: env.appBaseUrl!,
    enableParallelTransactions: false,
    transactionCookie: {
      maxAge: 60 * 60 * 2,
      sameSite: "lax",
    },
    onCallback: async (error, ctx) => {
      const appBaseUrl = ctx.appBaseUrl ?? getAuthEnv().appBaseUrl ?? "http://localhost:3000";
      if (error) {
        if (error instanceof InvalidStateError || error instanceof MissingStateError) {
          return loginErrorRedirect(
            appBaseUrl,
            "invalid_state",
            "Your sign-in session expired or was interrupted. Please try again in the same browser tab."
          );
        }
        return loginErrorRedirect(appBaseUrl, "auth_failed", error.message);
      }
      const destination = new URL(ctx.returnTo || "/", appBaseUrl);
      return NextResponse.redirect(destination);
    },
  });
}

/** Auth0 SDK client — only instantiated when Auth0 env vars are configured. */
export const auth0 = authConfigured() ? createAuth0Client() : null;
