import "server-only";

import { defaultOrgId } from "@/lib/auth/config";
import { resolveSlackCredentials } from "@/integrations/core/resolveIntegrationCredentials";

export async function slackSigningSecret(orgId = defaultOrgId()): Promise<string | null> {
  const creds = await resolveSlackCredentials(orgId);
  return creds.signingSecret;
}
