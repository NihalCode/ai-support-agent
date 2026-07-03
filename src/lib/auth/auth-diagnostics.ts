import "server-only";

import { resolveActionSharedSecret } from "@/lib/auth/action-shared-secret";
import { initialOwnerEmail } from "@/lib/auth/auth-config-public";
import { cleanEnvValue } from "@/lib/auth/env";
import { defaultOrgId } from "@/lib/auth/config";
import { listUsers } from "@/lib/auth/user-store";

export interface AuthDiagnosticsPayload {
  app: "support";
  auth0ClientIdConfigured: boolean;
  baseUrlConfigured: boolean;
  actionSharedSecretConfigured: boolean;
  bootstrapOwnerEmailConfigured: boolean;
  databaseConnected: boolean;
  activeUserCount: number;
  activeOwnerExists: boolean;
  inviteCheckEndpointHealthy: boolean;
  callbackUrlExpected: "configured" | "missing";
}

export async function buildAuthDiagnostics(): Promise<AuthDiagnosticsPayload> {
  const appBase = cleanEnvValue(process.env.APP_BASE_URL);
  const clientId = cleanEnvValue(process.env.AUTH0_CLIENT_ID);
  const orgId = defaultOrgId();

  let activeUserCount = 0;
  let activeOwnerExists = false;
  let databaseConnected = false;

  try {
    const users = await listUsers(orgId);
    databaseConnected = true;
    activeUserCount = users.filter((u) => u.status === "active").length;
    activeOwnerExists = users.some((u) => u.status === "active" && u.role === "owner");
  } catch {
    databaseConnected = false;
  }

  const secret = resolveActionSharedSecret();
  const secretConfigured = Boolean(secret);
  let inviteCheckEndpointHealthy = false;
  if (secretConfigured && appBase) {
    try {
      const res = await fetch(`${appBase}/api/auth/invite-check`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ email: "diagnostics-probe@invalid.local" }),
      });
      const text = await res.text();
      inviteCheckEndpointHealthy =
        res.status === 200 &&
        Boolean(text) &&
        typeof JSON.parse(text)?.allowed === "boolean";
    } catch {
      inviteCheckEndpointHealthy = false;
    }
  }

  return {
    app: "support",
    auth0ClientIdConfigured: Boolean(clientId),
    baseUrlConfigured: Boolean(appBase),
    actionSharedSecretConfigured: secretConfigured,
    bootstrapOwnerEmailConfigured: Boolean(initialOwnerEmail()),
    databaseConnected,
    activeUserCount,
    activeOwnerExists,
    inviteCheckEndpointHealthy,
    callbackUrlExpected: appBase ? "configured" : "missing",
  };
}
