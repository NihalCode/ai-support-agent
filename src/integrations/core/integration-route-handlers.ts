import "server-only";

import type { AppSession } from "@/lib/auth/session";
import { CredentialStore } from "./CredentialStore";
import { getEnterpriseConnector } from "./EnterpriseConnectorRegistry";
import { IntegrationAuditLog } from "./IntegrationAuditLog";
import { IntegrationHealthService } from "./IntegrationHealthService";
import { IntegrationMetadataStore, maskEmail, type IntegrationMetadata } from "./IntegrationMetadataStore";
import { IntegrationRegistry } from "./IntegrationRegistry";
import { credentialFieldsFor } from "./integrationCredentialFields";
import type { IntegrationCredentialPayload, IntegrationId } from "./IntegrationTypes";
import {
  confluenceCredentialsConfigured,
  jiraCredentialsConfigured,
  resolveConfluenceCredentials,
  resolveJiraCredentials,
  resolveSlackCredentials,
  resolveZendeskCredentials,
  slackCredentialsConfigured,
  zendeskCredentialsConfigured,
} from "./resolveIntegrationCredentials";

export type EnterpriseIntegrationId = Extract<
  IntegrationId,
  "slack" | "confluence" | "zendesk" | "jira"
>;

export const ENTERPRISE_INTEGRATION_IDS: EnterpriseIntegrationId[] = [
  "slack",
  "confluence",
  "zendesk",
  "jira",
];

export function isEnterpriseIntegrationId(value: string): value is EnterpriseIntegrationId {
  return (ENTERPRISE_INTEGRATION_IDS as readonly string[]).includes(value);
}

function integrationName(id: EnterpriseIntegrationId): string {
  return IntegrationRegistry.getDefinition(id)?.name ?? id;
}

function metadataFromCredentials(
  id: EnterpriseIntegrationId,
  credentials: IntegrationCredentialPayload,
  extra?: IntegrationMetadata
): IntegrationMetadata {
  const base: IntegrationMetadata = { ...extra };
  if (id === "jira") {
    if (credentials.baseUrl) base.baseUrl = credentials.baseUrl;
    if (credentials.email) base.emailMasked = maskEmail(credentials.email);
    if (credentials.projectKey) base.defaultProjectKey = credentials.projectKey;
    if (extra?.issueType) base.issueType = extra.issueType;
    if (extra?.labels) base.labels = extra.labels;
  }
  if (id === "zendesk") {
    if (credentials.subdomain) base.subdomain = credentials.subdomain;
    if (credentials.email) base.emailMasked = maskEmail(credentials.email);
    if (extra?.replyMode) base.replyMode = extra.replyMode;
  }
  if (id === "confluence") {
    if (credentials.baseUrl) base.baseUrl = credentials.baseUrl;
    if (credentials.email) base.emailMasked = maskEmail(credentials.email);
    const space = credentials.spaceKey ?? extra?.spaceKeys?.[0];
    if (space) base.spaceKeys = [space];
  }
  if (id === "slack") {
    if (extra?.defaultChannelId) base.defaultChannelId = extra.defaultChannelId;
    if (extra?.teamId) base.teamId = extra.teamId;
  }
  return base;
}

async function configuredStatus(orgId: string, id: EnterpriseIntegrationId): Promise<boolean> {
  switch (id) {
    case "jira":
      return jiraCredentialsConfigured(await resolveJiraCredentials(orgId));
    case "zendesk":
      return zendeskCredentialsConfigured(await resolveZendeskCredentials(orgId));
    case "confluence":
      return confluenceCredentialsConfigured(await resolveConfluenceCredentials(orgId));
    case "slack":
      return slackCredentialsConfigured(await resolveSlackCredentials(orgId));
    default:
      return false;
  }
}

export async function getIntegrationStatus(orgId: string, id: EnterpriseIntegrationId) {
  const def = IntegrationRegistry.getDefinition(id);
  const metadata = await IntegrationMetadataStore.get(orgId, id);
  const latestHealth = await IntegrationHealthService.latest(orgId, id);
  const statuses = await IntegrationRegistry.statusForOrg(orgId);
  const row = statuses.find((s) => s.id === id);
  const configured = row?.configured ?? (await configuredStatus(orgId, id));

  return {
    id,
    name: def?.name ?? id,
    configured,
    source: row?.source ?? "mock",
    status: metadata?.status ?? (configured ? "connected" : "not_connected"),
    metadata: metadata?.metadata ?? {},
    connectedByUserId: metadata?.createdByUserId,
    updatedAt: metadata?.updatedAt,
    health: latestHealth
      ? {
          ok: latestHealth.status === "success",
          message: latestHealth.message,
          checkedAt: latestHealth.checkedAt,
        }
      : row?.health
        ? {
            ok: row.health === "healthy",
            message: row.detail ?? "Not checked yet",
            checkedAt: row.lastCheckedAt,
          }
        : null,
    credentialFields: credentialFieldsFor(id).map((f) => ({
      ...f,
      configured: f.secret ? undefined : true,
    })),
    secretsConfigured: {
      apiToken: configured && id !== "slack",
      botToken: id === "slack" ? configured : undefined,
      signingSecret: id === "slack" ? configured : undefined,
    },
  };
}

export async function configureIntegration(
  session: AppSession,
  id: EnterpriseIntegrationId,
  input: {
    credentials: IntegrationCredentialPayload;
    metadata?: IntegrationMetadata;
  }
) {
  const orgId = session.user.orgId;
  const fields = credentialFieldsFor(id);
  const required = fields.filter((f) => !f.optional);
  const missing = required.filter((f) => !input.credentials[f.key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.map((f) => f.label).join(", ")}`);
  }

  await CredentialStore.save(id, input.credentials, orgId, session.user.id);
  const configured = await configuredStatus(orgId, id);
  const metadata = metadataFromCredentials(id, input.credentials, input.metadata);
  const record = await IntegrationMetadataStore.upsert({
    orgId,
    type: id,
    name: integrationName(id),
    status: configured ? "connected" : "not_connected",
    metadata,
    createdByUserId: session.user.id,
  });

  await IntegrationAuditLog.append({
    orgId,
    actorId: session.user.id,
    actorEmail: session.user.email,
    action: "configure",
    integrationId: id,
    detail: "Credentials saved to encrypted store",
  });

  return { ok: true, record: { ...record, metadata } };
}

export async function disconnectIntegration(session: AppSession, id: EnterpriseIntegrationId) {
  const orgId = session.user.orgId;
  const removed = await CredentialStore.delete(id, orgId);
  await IntegrationMetadataStore.disconnect(orgId, id);

  await IntegrationAuditLog.append({
    orgId,
    actorId: session.user.id,
    actorEmail: session.user.email,
    action: "delete",
    integrationId: id,
    detail: removed ? "Integration disconnected" : "No stored credentials",
  });

  return { ok: true, removed };
}

export async function testIntegration(session: AppSession, id: EnterpriseIntegrationId) {
  const orgId = session.user.orgId;
  const connector = getEnterpriseConnector(id);
  if (!connector) {
    return { ok: false, detail: "No connector available" };
  }

  const result = await connector.healthCheck();
  await IntegrationHealthService.record(orgId, id, result);
  await IntegrationAuditLog.append({
    orgId,
    actorId: session.user.id,
    actorEmail: session.user.email,
    action: "health_check",
    integrationId: id,
    detail: result.message,
  });

  if (result.ok) {
    const metadata = await IntegrationMetadataStore.get(orgId, id);
    if (metadata) {
      await IntegrationMetadataStore.upsert({
        orgId,
        type: id,
        name: metadata.name,
        status: "connected",
        metadata: metadata.metadata,
        createdByUserId: metadata.createdByUserId,
      });
    }
  }

  return {
    ok: result.ok,
    detail: result.message,
    mock: result.mock,
    checkedAt: result.checkedAt,
  };
}
