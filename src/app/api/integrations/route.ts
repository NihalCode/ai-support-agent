import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/auth/session";
import { canConfigureJira, canDisconnectJira } from "@/lib/auth/roles";
import { IntegrationAuditLog } from "@/integrations/core/IntegrationAuditLog";
import { IntegrationRegistry } from "@/integrations/core/IntegrationRegistry";
import { credentialFieldsFor } from "@/integrations/core/integrationCredentialFields";
import { runIntegrationHealthCheck } from "@/integrations/core/IntegrationHealthCheck";
import { CredentialStore, hasCredentialEncryption } from "@/integrations/core/CredentialStore";
import {
  configureIntegration,
  disconnectIntegration,
  isEnterpriseIntegrationId,
} from "@/integrations/core/integration-route-handlers";
import type { IntegrationId } from "@/integrations/core/IntegrationTypes";
import { INTEGRATION_IDS } from "@/integrations/core/IntegrationTypes";

export const runtime = "nodejs";

function parseIntegrationId(value: string): IntegrationId | null {
  return (INTEGRATION_IDS as readonly string[]).includes(value)
    ? (value as IntegrationId)
    : null;
}

export async function GET() {
  const sessionOrResponse = await requirePermission("integrations:read");
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  const orgId = sessionOrResponse.user.orgId;
  const integrations = await IntegrationRegistry.statusForOrg(orgId);
  const definitions = IntegrationRegistry.listDefinitions();
  const audit = await IntegrationAuditLog.recent(20);

  return NextResponse.json({
    integrations,
    definitions,
    credentialFields: Object.fromEntries(
      definitions.map((d) => [d.id, credentialFieldsFor(d.id)])
    ),
    credentialStore: {
      encryptionAvailable: hasCredentialEncryption(),
    },
    audit,
  });
}

export async function POST(request: Request) {
  const sessionOrResponse = await requirePermission("integrations:write");
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  let body: {
    integrationId?: string;
    action?: "health_check" | "save" | "delete";
    credentials?: Record<string, string>;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const integrationId = parseIntegrationId(body.integrationId ?? "");
  if (!integrationId) {
    return NextResponse.json({ error: "Invalid integrationId" }, { status: 400 });
  }

  const orgId = sessionOrResponse.user.orgId;
  const actor = sessionOrResponse.user;

  if (integrationId === "jira" && body.action === "save" && !canConfigureJira(actor.role)) {
    return NextResponse.json(
      { error: "Custom Jira configuration requires Developer/Admin Mode." },
      { status: 403 }
    );
  }

  if (integrationId === "jira" && body.action === "delete" && !canDisconnectJira(actor.role)) {
    return NextResponse.json(
      { error: "Disconnecting Jira requires Owner or Admin role." },
      { status: 403 }
    );
  }

  if (body.action === "health_check") {
    const health = await runIntegrationHealthCheck(integrationId, orgId);
    await IntegrationAuditLog.append({
      orgId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "health_check",
      integrationId,
      detail: health.detail,
    });
    return NextResponse.json({ health });
  }

  if (body.action === "delete") {
    if (isEnterpriseIntegrationId(integrationId)) {
      const result = await disconnectIntegration(sessionOrResponse, integrationId);
      return NextResponse.json(result);
    }
    const removed = await CredentialStore.delete(integrationId, orgId);
    await IntegrationAuditLog.append({
      orgId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "delete",
      integrationId,
      detail: removed ? "Removed stored credentials" : "No stored credentials",
    });
    return NextResponse.json({ ok: true, removed });
  }

  if (body.action === "save") {
    if (!body.credentials || typeof body.credentials !== "object") {
      return NextResponse.json({ error: "credentials required" }, { status: 400 });
    }
    if (isEnterpriseIntegrationId(integrationId)) {
      try {
        const result = await configureIntegration(sessionOrResponse, integrationId, {
          credentials: body.credentials,
        });
        return NextResponse.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Save failed";
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }
    try {
      await CredentialStore.save(integrationId, body.credentials, orgId, actor.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    await IntegrationAuditLog.append({
      orgId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "configure",
      integrationId,
      detail: "Credentials saved to encrypted store",
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
